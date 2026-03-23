const User = require('../models/User');

exports.getAllUsers = async (req, res) => {
  try {
    const currentUserId = req.query.currentUserId;

    // Get all users except the current user
    const users = await User.find({ _id: { $ne: currentUserId } }).select('_id username isOnline');

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
