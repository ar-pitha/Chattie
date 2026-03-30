const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true
  },
  receiver: {
    type: String,
    required: true
  },
  text: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'seen'],
    default: 'sent'
  },
  deletedFor: {
    type: [String],
    default: []
  },
  deletedForAll: {
    type: Boolean,
    default: false
  },
  replyTo: {
    messageId: mongoose.Schema.Types.ObjectId,
    text: String,
    sender: String
  },
  // Edit support
  editedAt: {
    type: Date,
    default: null
  },
  originalText: {
    type: String,
    default: null
  },
  // Star support — array of usernames who starred this message
  starredBy: {
    type: [String],
    default: []
  },
  // Pin support
  pinned: {
    type: Boolean,
    default: false
  },
  pinnedAt: {
    type: Date,
    default: null
  },
  pinnedBy: {
    type: String,
    default: null
  },
  // Emoji reactions — [{emoji: '❤️', users: ['alice', 'bob']}]
  reactions: {
    type: [{
      emoji: { type: String, required: true },
      users: { type: [String], default: [] }
    }],
    default: []
  },
  // Call event message support
  callEvent: {
    type: {
      callType: { type: String, enum: ['audio', 'video'], default: 'audio' },
      duration: { type: Number, default: 0 },
      status: { type: String, enum: ['completed', 'missed', 'rejected'], default: 'completed' }
    },
    default: null
  },
  // Media support
  media: {
    type: {
      mediaType: {
        type: String,
        enum: ['photo', 'video', 'document', null],
        default: null
      },
      fileId: mongoose.Schema.Types.ObjectId,  // GridFS file ID
      fileName: String,       // Original file name
      fileSizeKB: Number,     // File size in KB
      mimeType: String        // MIME type for proper display
    },
    default: null
  }
});

// Index for querying messages between two users
messageSchema.index({ sender: 1, receiver: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);
