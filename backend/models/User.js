const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  fcm_token: {
    type: String,
    default: null
  },
  socketId: {
    type: String,
    default: null
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  appLockPassword: {
    type: String,
    default: null
  },
  hasAppLock: {
    type: Boolean,
    default: false
  },
  profilePic: {
    type: String,
    default: null
  },
  // Track unread message counts per user: { username: count }
  unreadCounts: {
    type: Map,
    of: Number,
    default: new Map()
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);
