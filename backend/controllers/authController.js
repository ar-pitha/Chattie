const User = require('../models/User');

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
        fcm_token: user.fcm_token
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
