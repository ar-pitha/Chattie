const User = require('../models/User');

exports.getAllUsers = async (req, res) => {
  try {
    const currentUserId = req.query.currentUserId;

    // Get all users except the current user
    const users = await User.find({ _id: { $ne: currentUserId } }).select('_id username isOnline unreadCounts profilePic');

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
};

exports.updateOnlineStatus = async (req, res) => {
  try {
    const { userId, isOnline, socketId } = req.body;

    const updateData = { isOnline };
    if (socketId) {
      updateData.socketId = socketId;
    }

    await User.findByIdAndUpdate(userId, updateData);

    res.status(200).json({ message: 'Online status updated' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating status', error: error.message });
  }
};

// Get unread message counts for a user
exports.getUnreadCounts = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('unreadCounts');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Convert Map to object for JSON serialization
    const unreadCountsObj = user.unreadCounts ? Object.fromEntries(user.unreadCounts) : {};

    res.status(200).json({ unreadCounts: unreadCountsObj });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching unread counts', error: error.message });
  }
};

// Clear unread count for a specific sender
exports.clearUnreadCount = async (req, res) => {
  try {
    const { userId, senderUsername } = req.body;

    if (!userId || !senderUsername) {
      return res.status(400).json({ message: 'userId and senderUsername required' });
    }

    // Clear the unread count for this sender
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $unset: { [`unreadCounts.${senderUsername}`]: 1 }
      },
      { new: true }
    );

    res.status(200).json({ message: 'Unread count cleared', unreadCounts: Object.fromEntries(user.unreadCounts || new Map()) });
  } catch (error) {
    res.status(500).json({ message: 'Error clearing unread count', error: error.message });
  }
};

// Increment unread count (called when new message arrives)
exports.incrementUnreadCount = async (req, res) => {
  try {
    const { userId, senderUsername } = req.body;

    if (!userId || !senderUsername) {
      return res.status(400).json({ message: 'userId and senderUsername required' });
    }

    // Increment unread count for this sender
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { [`unreadCounts.${senderUsername}`]: 1 }
      },
      { new: true }
    );

    res.status(200).json({ 
      message: 'Unread count incremented',
      unreadCounts: Object.fromEntries(user.unreadCounts || new Map())
    });
  } catch (error) {
    res.status(500).json({ message: 'Error incrementing unread count', error: error.message });
  }
};
