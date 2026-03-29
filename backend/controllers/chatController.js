const Message = require('../models/Message');
const User = require('../models/User');

let io = null;
let connectedUsers = null;

exports.setIO = (socketIO, users) => {
  io = socketIO;
  connectedUsers = users;
};

// Get last message for each conversation a user has
exports.getLastMessages = async (req, res) => {
  try {
    const { username } = req.params;

    const lastMessages = await Message.aggregate([
      // All messages involving this user
      { $match: { $or: [{ sender: username }, { receiver: username }] } },
      // Create a conversation key (sorted pair so A-B == B-A)
      { $addFields: {
        conversationWith: {
          $cond: [{ $eq: ['$sender', username] }, '$receiver', '$sender']
        }
      }},
      // Sort by newest first, then pick the first per conversation
      { $sort: { timestamp: -1 } },
      { $group: {
        _id: '$conversationWith',
        text: { $first: '$text' },
        sender: { $first: '$sender' },
        timestamp: { $first: '$timestamp' },
        status: { $first: '$status' },
        media: { $first: '$media' }
      }}
    ]);

    // Convert to { username: { text, sender, timestamp, status, media } }
    const result = {};
    lastMessages.forEach(m => {
      result[m._id] = { text: m.text, sender: m.sender, timestamp: m.timestamp, status: m.status, media: m.media || null };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { sender, receiver } = req.query;

    if (!sender || !receiver) {
      return res.status(400).json({ message: 'sender and receiver required' });
    }

    // Clear unread count: "sender" (current user) is reading messages from "receiver" (other user)
    await User.findOneAndUpdate(
      { username: sender },
      { $unset: { [`unreadCounts.${receiver}`]: 1 } }
    );
    // Notify frontend to clear the badge
    if (io) {
      const clearData = { senderUsername: receiver };
      io.to(`user_${sender}`).emit('unread-count-cleared', clearData);
      const senderSocketId = connectedUsers?.[sender];
      if (senderSocketId) {
        io.to(senderSocketId).emit('unread-count-cleared', clearData);
      }
    }

    // Get all messages between two users
    const messages = await Message.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender }
      ]
    }).sort({ timestamp: 1 });

    const filteredMessages = messages.map(msg => {
      const msgObj = {
        _id: msg._id,
        sender: msg.sender,
        receiver: msg.receiver,
        text: msg.text,
        timestamp: msg.timestamp,
        status: msg.status || 'sent',
        deletedFor: msg.deletedFor || [],
        replyTo: msg.replyTo || null,
        media: msg.media || null
      };

      if (msg.deletedFor && msg.deletedFor.includes(sender)) {
        msgObj.text = '[Deleted message]';
        msgObj.deletedForMe = true;
      }

      return msgObj;
    });

    res.status(200).json(filteredMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Error fetching messages', error: error.message });
  }
};

exports.saveMessage = async (req, res) => {
  try {
    const { sender, receiver, text, replyTo } = req.body;

    if (!sender || !receiver || !text) {
      return res.status(400).json({ message: 'sender, receiver, and text required' });
    }

    const message = new Message({
      sender,
      receiver,
      text,
      timestamp: new Date(),
      replyTo: replyTo || null
    });

    await message.save();

    // Always increment receiver's unread count for this sender
    const updatedUser = await User.findOneAndUpdate(
      { username: receiver },
      { $inc: { [`unreadCounts.${sender}`]: 1 } },
      { new: true }
    );

    // Notify receiver's frontend of the new unread count via socket
    if (io && updatedUser) {
      // Safely read the count from the Mongoose Map
      const countsObj = updatedUser.unreadCounts
        ? Object.fromEntries(updatedUser.unreadCounts)
        : {};
      const newCount = countsObj[sender] || 1;
      console.log(`📬 Unread count: ${sender} → ${receiver}, count=${newCount}`);
      const unreadData = { senderUsername: sender, count: newCount };
      io.to(`user_${receiver}`).emit('unread-count-updated', unreadData);
      // Direct socket fallback
      const receiverSocketId = connectedUsers?.[receiver];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('unread-count-updated', unreadData);
      }
    }

    const messageObject = message.toObject();

    // Emit receive_message to receiver in real-time (server-authoritative delivery)
    // Use both room-based AND direct socket delivery for robustness in deployment
    // (Render free tier can drop rooms after sleep/wake cycles)
    if (io) {
      io.to(`user_${receiver}`).emit('receive_message', messageObject);
      // Direct socket fallback in case room membership was lost
      const receiverSocketId = connectedUsers?.[receiver];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_message', messageObject);
      }
    }

    res.status(201).json({ message: 'Message saved successfully', data: messageObject });
  } catch (error) {
    res.status(500).json({ message: 'Error saving message', error: error.message });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    if (!messageId) return res.status(400).json({ message: 'messageId required' });

    const result = await Message.findByIdAndDelete(messageId);
    if (!result) return res.status(404).json({ message: 'Message not found' });

    res.status(200).json({ message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting message', error: error.message });
  }
};

exports.deleteMessageForMe = async (req, res) => {
  try {
    const { messageId, username } = req.body;
    if (!messageId || !username) return res.status(400).json({ message: 'messageId and username required' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (!message.deletedFor.includes(username)) {
      message.deletedFor.push(username);
      await message.save();
    }

    res.status(200).json({ message: 'Message deleted for you', data: message });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting message', error: error.message });
  }
};

// DEBUG: Check media messages for a conversation
exports.debugMessagesWithMedia = async (req, res) => {
  try {
    const { sender, receiver } = req.query;

    if (!sender || !receiver) {
      return res.status(400).json({ message: 'sender and receiver required' });
    }

    console.log(`🔍 Debug: Fetching messages between ${sender} and ${receiver}`);

    // Get all messages between two users
    const allMessages = await Message.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender }
      ]
    }).sort({ timestamp: 1 }).lean();

    console.log(`📊 Total messages found: ${allMessages.length}`);

    // Separate messages with and without media
    const messagesWithMedia = allMessages.filter(m => m.media && m.media.fileId);
    const messagesWithoutMedia = allMessages.filter(m => !m.media || !m.media.fileId);

    console.log(`✅ Messages with media field: ${messagesWithMedia.length}`);
    console.log(`❌ Messages without media field: ${messagesWithoutMedia.length}`);

    // Show sample messages of each type
    const sampleWithMedia = messagesWithMedia.slice(0, 2).map(m => ({
      _id: m._id,
      text: m.text,
      media: m.media,
      timestamp: m.timestamp
    }));

    const sampleWithoutMedia = messagesWithoutMedia.slice(0, 2).map(m => ({
      _id: m._id,
      text: m.text,
      media: m.media,
      timestamp: m.timestamp
    }));

    res.json({
      summary: {
        total: allMessages.length,
        withMedia: messagesWithMedia.length,
        withoutMedia: messagesWithoutMedia.length
      },
      sampleWithMedia,
      sampleWithoutMedia,
      mediaDetails: messagesWithMedia.map(m => ({
        fileName: m.media?.fileName,
        fileId: m.media?.fileId,
        mediaType: m.media?.mediaType,
        mimeType: m.media?.mimeType
      }))
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ message: 'Debug error', error: error.message });
  }
};
