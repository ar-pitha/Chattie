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
        msgId: { $first: '$_id' },
        text: { $first: '$text' },
        sender: { $first: '$sender' },
        timestamp: { $first: '$timestamp' },
        status: { $first: '$status' },
        media: { $first: '$media' },
        deletedForAll: { $first: '$deletedForAll' }
      }}
    ]);

    // Convert to { username: { _id, text, sender, timestamp, status, media, deletedForAll } }
    const result = {};
    lastMessages.forEach(m => {
      result[m._id] = { _id: m.msgId, text: m.text, sender: m.sender, timestamp: m.timestamp, status: m.status, media: m.media || null, deletedForAll: m.deletedForAll || false };
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
    if (io) {
      io.to(`user_${sender}`).emit('unread-count-cleared', { senderUsername: receiver });
    }

    // Get all messages between two users
    const messages = await Message.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender }
      ]
    }).sort({ timestamp: 1 }).lean();

    const filteredMessages = messages
      .filter(msg => !(msg.deletedFor && msg.deletedFor.includes(sender)))
      .map(msg => ({
        _id: msg._id,
        sender: msg.sender,
        receiver: msg.receiver,
        text: msg.text,
        timestamp: msg.timestamp,
        status: msg.status || 'sent',
        deletedFor: msg.deletedFor || [],
        deletedForAll: msg.deletedForAll || false,
        replyTo: msg.replyTo || null,
        media: msg.media || null,
        editedAt: msg.editedAt || null,
        starredBy: msg.starredBy || [],
        pinned: msg.pinned || false,
        pinnedAt: msg.pinnedAt || null,
        pinnedBy: msg.pinnedBy || null,
        callEvent: msg.callEvent || null,
        reactions: msg.reactions || []
      }));

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
      const countsObj = updatedUser.unreadCounts
        ? Object.fromEntries(updatedUser.unreadCounts)
        : {};
      const newCount = countsObj[sender] || 1;
      io.to(`user_${receiver}`).emit('unread-count-updated', { senderUsername: sender, count: newCount });
    }

    const messageObject = message.toObject();

    // Emit receive_message to receiver in real-time (room-based delivery)
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

    const message = await Message.findByIdAndUpdate(messageId, {
      text: 'This message was deleted',
      deletedForAll: true,
      media: null,
      replyTo: null
    }, { new: true });
    if (!message) return res.status(404).json({ message: 'Message not found' });

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

// Edit message (24-hour limit)
exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { text, username } = req.body;
    if (!messageId || !text || !username) return res.status(400).json({ message: 'messageId, text, and username required' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.sender !== username) return res.status(403).json({ message: 'You can only edit your own messages' });
    if (message.deletedForAll) return res.status(400).json({ message: 'Cannot edit deleted message' });
    if (message.media) return res.status(400).json({ message: 'Cannot edit media messages' });

    // 24-hour limit
    const hoursSince = (Date.now() - new Date(message.timestamp).getTime()) / (1000 * 60 * 60);
    if (hoursSince > 24) return res.status(400).json({ message: 'Edit window expired (24 hours)' });

    if (!message.originalText) message.originalText = message.text;
    message.text = text;
    message.editedAt = new Date();
    await message.save();

    const msgObj = message.toObject();

    if (io) {
      const editData = { messageId, text, editedAt: msgObj.editedAt, sender: message.sender, receiver: message.receiver };
      io.to(`user_${message.sender}`).emit('message_edited', editData);
      io.to(`user_${message.receiver}`).emit('message_edited', editData);
    }

    res.status(200).json({ message: 'Message edited', data: msgObj });
  } catch (error) {
    res.status(500).json({ message: 'Error editing message', error: error.message });
  }
};

// Toggle star on a message
exports.toggleStar = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { username } = req.body;
    if (!messageId || !username) return res.status(400).json({ message: 'messageId and username required' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const isStarred = message.starredBy.includes(username);
    if (isStarred) {
      message.starredBy = message.starredBy.filter(u => u !== username);
    } else {
      message.starredBy.push(username);
    }
    await message.save();

    res.status(200).json({ message: isStarred ? 'Unstarred' : 'Starred', starred: !isStarred });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling star', error: error.message });
  }
};

// Get starred messages for a user
exports.getStarredMessages = async (req, res) => {
  try {
    const { username } = req.params;
    const messages = await Message.find({
      starredBy: username,
      deletedForAll: { $ne: true }
    }).sort({ timestamp: -1 }).limit(100).lean();
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching starred messages', error: error.message });
  }
};

// Pin/unpin a message
exports.togglePin = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { username } = req.body;
    if (!messageId || !username) return res.status(400).json({ message: 'messageId and username required' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const wasPinned = message.pinned;

    message.pinned = !wasPinned;
    message.pinnedAt = wasPinned ? null : new Date();
    message.pinnedBy = wasPinned ? null : username;
    await message.save();

    const msgObj = message.toObject();

    if (io) {
      const pinData = { messageId, pinned: message.pinned, pinnedBy: username, message: msgObj };
      io.to(`user_${message.sender}`).emit('message_pinned', pinData);
      io.to(`user_${message.receiver}`).emit('message_pinned', pinData);
    }

    res.status(200).json({ message: wasPinned ? 'Unpinned' : 'Pinned', data: msgObj });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling pin', error: error.message });
  }
};

// Get all pinned messages for a conversation
exports.getPinnedMessages = async (req, res) => {
  try {
    const { user1, user2 } = req.query;
    if (!user1 || !user2) return res.status(400).json({ message: 'user1 and user2 required' });

    const pinned = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ],
      pinned: true,
      deletedForAll: { $ne: true }
    }).sort({ pinnedAt: -1 }).lean();

    res.status(200).json(pinned);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pinned message', error: error.message });
  }
};

// Save a call event as a chat message
exports.saveCallEvent = async (req, res) => {
  try {
    const { sender, receiver, callType, duration, status } = req.body;
    if (!sender || !receiver) return res.status(400).json({ message: 'sender and receiver required' });

    const statusText = status === 'missed' ? 'Missed' : status === 'rejected' ? 'Declined' : '';
    const typeText = callType === 'video' ? 'Video call' : 'Voice call';
    const durationMin = Math.floor(duration / 60);
    const durationSec = duration % 60;
    const durationText = duration > 0 ? ` (${durationMin}:${String(durationSec).padStart(2, '0')})` : '';
    const text = `${statusText ? statusText + ' ' : ''}${typeText}${durationText}`;

    const message = new Message({
      sender,
      receiver,
      text,
      timestamp: new Date(),
      callEvent: { callType: callType || 'audio', duration: duration || 0, status: status || 'completed' }
    });
    await message.save();
    const msgObj = message.toObject();

    if (io) {
      io.to(`user_${receiver}`).emit('receive_message', msgObj);
      io.to(`user_${sender}`).emit('receive_message', msgObj);
    }

    res.status(201).json({ data: msgObj });
  } catch (error) {
    res.status(500).json({ message: 'Error saving call event', error: error.message });
  }
};

// Toggle emoji reaction on a message
exports.toggleReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji, username } = req.body;
    if (!messageId || !emoji || !username) return res.status(400).json({ message: 'messageId, emoji, and username required' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    let added = false;
    const existingReaction = message.reactions.find(r => r.emoji === emoji);

    if (existingReaction && existingReaction.users.includes(username)) {
      // Same emoji tapped again — remove it (toggle off)
      existingReaction.users = existingReaction.users.filter(u => u !== username);
      if (existingReaction.users.length === 0) {
        message.reactions = message.reactions.filter(r => r.emoji !== emoji);
      }
    } else {
      // Remove user from any other reaction first (one reaction per user)
      for (const r of message.reactions) {
        r.users = r.users.filter(u => u !== username);
      }
      message.reactions = message.reactions.filter(r => r.users.length > 0);

      // Add to the new emoji
      const target = message.reactions.find(r => r.emoji === emoji);
      if (target) {
        target.users.push(username);
      } else {
        message.reactions.push({ emoji, users: [username] });
      }
      added = true;

      // Mark reaction as unseen by the message sender (for sidebar notification)
      if (message.sender !== username) {
        message.reactionSeenBy = message.reactionSeenBy.filter(u => u !== message.sender);
      }
    }

    await message.save();

    if (io) {
      const reactionData = { messageId, emoji, username, added, reactions: message.reactions, messageSender: message.sender, messageReceiver: message.receiver, messageText: message.text };
      io.to(`user_${message.sender}`).emit('reaction_updated', reactionData);
      io.to(`user_${message.receiver}`).emit('reaction_updated', reactionData);
    }

    res.status(200).json({ message: added ? 'Reaction added' : 'Reaction removed', reactions: message.reactions });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling reaction', error: error.message });
  }
};

// Get unseen reaction notifications for a user (for sidebar on page load)
exports.getUnseenReactions = async (req, res) => {
  try {
    const { username } = req.params;
    // Find messages sent by this user that have reactions and the user hasn't seen them
    const messages = await Message.find({
      sender: username,
      'reactions.0': { $exists: true },
      reactionSeenBy: { $ne: username },
      deletedForAll: { $ne: true }
    }).sort({ timestamp: -1 }).lean();

    // Group by conversation partner (receiver) — pick the most recent per partner
    const notifs = {};
    for (const msg of messages) {
      if (notifs[msg.receiver]) continue;
      // Get the latest reaction emoji (last reactor who isn't the sender)
      const lastReaction = msg.reactions[msg.reactions.length - 1];
      if (lastReaction) {
        const reactor = lastReaction.users.find(u => u !== username) || lastReaction.users[0];
        notifs[msg.receiver] = {
          emoji: lastReaction.emoji,
          text: msg.text,
          reactor
        };
      }
    }
    res.json(notifs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Mark reactions as seen for a conversation
exports.markReactionsSeen = async (req, res) => {
  try {
    const { username, otherUser } = req.body;
    await Message.updateMany(
      {
        sender: username,
        receiver: otherUser,
        'reactions.0': { $exists: true },
        reactionSeenBy: { $ne: username }
      },
      { $addToSet: { reactionSeenBy: username } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
