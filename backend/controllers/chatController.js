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
        status: { $first: '$status' }
      }}
    ]);

    // Convert to { username: { text, sender, timestamp, status } }
    const result = {};
    lastMessages.forEach(m => {
      result[m._id] = { text: m.text, sender: m.sender, timestamp: m.timestamp, status: m.status };
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
      io.to(`user_${sender}`).emit('unread-count-cleared', { senderUsername: receiver });
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
        replyTo: msg.replyTo || null
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
      io.to(`user_${receiver}`).emit('unread-count-updated', {
        senderUsername: sender,
        count: newCount
      });
    }

    const messageObject = message.toObject();

    // Emit receive_message to receiver in real-time (server-authoritative delivery)
    // This ensures the receiver always gets the message even if client socket is unstable
    if (io) {
      io.to(`user_${receiver}`).emit('receive_message', messageObject);
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
