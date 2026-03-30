const User = require('../models/User');

// Socket.io instance and connected users map (set from server.js)
let io = null;
let connectedUsers = {};

exports.setIO = (ioInstance, usersMap) => {
  io = ioInstance;
  connectedUsers = usersMap;
};

exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Create new user (in production, hash password!)
    const newUser = new User({
      username,
      password // WARNING: Store hashed password in production!
    });

    await newUser.save();
    console.log(`✅ User registered: ${username}`);
    res.status(201).json({ message: 'User registered successfully', userId: newUser._id });
  } catch (error) {
    // Handle duplicate key error with helpful message
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      console.error(`❌ Registration error: Duplicate ${field}`);
      return res.status(400).json({ 
        message: `Username already exists. Choose a different username.`,
        error: error.message 
      });
    }
    
    console.error('❌ Registration error:', error.message);
    res.status(500).json({ message: 'Registration error', error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' });
    }

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Check password (in production, use bcrypt!)
    if (user.password !== password) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Mark user as online
    user.isOnline = true;
    await user.save();

    console.log(`✅ User logged in: ${username}`);
    res.status(200).json({
      message: 'Login successful',
      user: {
        _id: user._id,
        username: user.username,
        fcm_token: user.fcm_token,
        profilePic: user.profilePic
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: 'Login error', error: error.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const { userId } = req.body;

    // Mark user as offline
    await User.findByIdAndUpdate(userId, {
      isOnline: false,
      socketId: null
    });

    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    res.status(500).json({ message: 'Logout error', error: error.message });
  }
};

exports.updateFCMToken = async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;

    if (!userId || !fcmToken) {
      return res.status(400).json({ message: 'userId and fcmToken required' });
    }

    // Update FCM token for user
    const user = await User.findByIdAndUpdate(
      userId,
      { fcm_token: fcmToken },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'FCM token updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'FCM update error', error: error.message });
  }
};

// Set or update app lock password
exports.setAppLockPassword = async (req, res) => {
  try {
    const { username, appLockPassword } = req.body;

    if (!username || !appLockPassword) {
      return res.status(400).json({ message: 'username and appLockPassword required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // In production, hash the password with bcrypt!
    user.appLockPassword = appLockPassword;
    user.hasAppLock = true;
    await user.save();

    res.status(200).json({ message: 'App lock password set successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error setting app lock', error: error.message });
  }
};

// Verify app lock password
exports.verifyAppLockPassword = async (req, res) => {
  try {
    const { username, appLockPassword } = req.body;

    if (!username || !appLockPassword) {
      return res.status(400).json({ message: 'username and appLockPassword required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.hasAppLock) {
      return res.status(400).json({ message: 'App lock not enabled' });
    }

    // In production, use bcrypt.compare()!
    if (user.appLockPassword !== appLockPassword) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    res.status(200).json({ message: 'Password verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error verifying password', error: error.message });
  }
};

// Check if user has app lock enabled
exports.checkAppLock = async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({ message: 'username required' });
    }

    console.log('🔍 Checking app lock for user:', username);

    const user = await User.findOne({ username });
    if (!user) {
      console.log('❌ User not found:', username);
      return res.status(404).json({ message: 'User not found' });
    }

    // Safely check hasAppLock - default to false if field doesn't exist
    const hasAppLock = user.hasAppLock === true;
    console.log('✅ App lock status for', username, ':', hasAppLock);

    res.status(200).json({ 
      hasAppLock: hasAppLock
    });
  } catch (error) {
    console.error('💥 Error checking app lock:', error.message);
    res.status(500).json({ message: 'Error checking app lock', error: error.message });
  }
};

// Go offline (called via sendBeacon on tab close)
exports.goOffline = async (req, res) => {
  try {
    // sendBeacon may send as application/json (Blob) or text/plain (string)
    let username = req.body?.username;
    if (!username && typeof req.body === 'string') {
      try { username = JSON.parse(req.body).username; } catch {}
    }
    if (username) {
      await User.findOneAndUpdate({ username }, { isOnline: false });
      // Remove from connected users and broadcast offline to all clients
      if (connectedUsers[username]) {
        delete connectedUsers[username];
      }
      if (io) {
        io.emit('user_offline', { username });
      }
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(200).json({ ok: true }); // Always return 200 for beacon
  }
};

// Disable or enable app lock
exports.toggleAppLock = async (req, res) => {
  try {
    const { username, enabled } = req.body;

    if (!username || enabled === undefined) {
      return res.status(400).json({ message: 'username and enabled required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.hasAppLock = enabled;
    await user.save();

    const status = enabled ? 'enabled' : 'disabled';
    console.log(`✅ App lock ${status} for user: ${username}`);
    
    res.status(200).json({ 
      message: `App lock ${status} successfully`,
      hasAppLock: enabled
    });
  } catch (error) {
    console.error('💥 Error toggling app lock:', error.message);
    res.status(500).json({ message: 'Error toggling app lock', error: error.message });
  }
};
