const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app';

    await mongoose.connect(mongoUri, {
      // Connection pool — keep low for free tier, but reuse connections
      maxPoolSize: 5,
      minPoolSize: 1,
      // Faster timeout on cold start — don't wait forever
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
      // Buffer commands while connecting (critical for Render cold start)
      bufferCommands: true,
      // Auto-reconnect on connection drop
      heartbeatFrequencyMS: 15000,
    });

    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
