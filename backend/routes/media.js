const express = require('express');
const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');

const router = express.Router();

// Store io and connectedUsers references
let io = null;
let connectedUsers = null;

// GridFS Bucket instance
let gfs = null;
let isGridFSReady = false;

// Initialize GridFS Bucket when database is connected
const initGridFS = () => {
  try {
    const connection = mongoose.connection;
    
    // Get database name from env or extract from URI
    let dbName = process.env.MONGODB_DB;
    if (!dbName) {
      // Extract from MONGODB_URI: mongodb+srv://user:pass@host/dbname
      const uri = process.env.MONGODB_URI;
      const match = uri?.match(/\/([a-zA-Z0-9_-]+)(\?|$)/);
      dbName = match ? match[1] : 'test';
    }
    
    console.log(`📍 Initializing GridFS for database: ${dbName}`);
    
    const db = connection.getClient().db(dbName);
    
    gfs = new GridFSBucket(db, {
      bucketName: 'media'
    });
    isGridFSReady = true;
    console.log(`✅ GridFS initialized for media storage in database: ${dbName}`);
  } catch (error) {
    console.error('❌ Failed to initialize GridFS:', error.message);
    // Retry after 5 seconds
    setTimeout(initGridFS, 5000);
  }
};

// Ensure GridFS is initialized when connection is ready
if (mongoose.connection.readyState === 1) {
  initGridFS();
} else {
  mongoose.connection.once('open', () => {
    console.log('📡 MongoDB connected, initializing GridFS...');
    initGridFS();
  });
}

// Export function to set io and connectedUsers
router.setIO = (socketIO, users) => {
  io = socketIO;
  connectedUsers = users;
};

// File type configurations
const ALLOWED_TYPES = {
  photo: {
    mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    maxSize: 5 * 1024 * 1024 // 5MB
  },
  video: {
    mimes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'],
    extensions: ['.mp4', '.mov', '.webm', '.avi'],
    maxSize: 50 * 1024 * 1024 // 50MB
  },
  document: {
    mimes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
    extensions: ['.pdf', '.doc', '.docx', '.txt'],
    maxSize: 20 * 1024 * 1024 // 20MB
  }
};

// Get all allowed MIME types
const ALL_ALLOWED_MIMES = Object.values(ALLOWED_TYPES).reduce((acc, type) => [
  ...acc,
  ...type.mimes
], []);

// Storage configuration - use memory storage (files stay in RAM during upload)
const storage = multer.memoryStorage();

// File filter - check MIME type
const fileFilter = (req, file, cb) => {
  if (!ALL_ALLOWED_MIMES.includes(file.mimetype)) {
    return cb(new Error('Invalid file type. Only images, videos, and documents are allowed'), false);
  }
  cb(null, true);
};

// Multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Upload media and create message
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { sender, receiver, mediaType, text = '' } = req.body;
    const file = req.file;

    // Validate required fields
    if (!sender || !receiver || !mediaType || !file) {
      return res.status(400).json({ 
        message: 'Missing required fields: sender, receiver, mediaType, file' 
      });
    }

    // Validate mediaType
    const config = ALLOWED_TYPES[mediaType];
    if (!config) {
      return res.status(400).json({ 
        message: `Invalid media type: ${mediaType}. Allowed: photo, video, document` 
      });
    }

    // Validate MIME type for this specific media type
    if (!config.mimes.includes(file.mimetype)) {
      return res.status(400).json({ 
        message: `Invalid file type for ${mediaType}. Allowed: ${config.extensions.join(', ')}` 
      });
    }

    // Validate file size
    if (file.size > config.maxSize) {
      const maxSizeMB = Math.round(config.maxSize / (1024 * 1024));
      return res.status(400).json({ 
        message: `File too large. Maximum size for ${mediaType}s is ${maxSizeMB}MB` 
      });
    }

    // Ensure GridFS is initialized
    if (!gfs || !isGridFSReady) {
      console.error('❌ GridFS not ready for upload. Connection state:', mongoose.connection.readyState);
      return res.status(503).json({ 
        message: 'File storage system not ready. Please try again in a moment.' 
      });
    }

    // Store file in GridFS
    const uploadStream = gfs.openUploadStream(file.originalname, {
      metadata: {
        mediaType,
        mimeType: file.mimetype,
        sender,
        receiver,
        uploadedAt: new Date()
      }
    });

    // Write file buffer to GridFS stream
    uploadStream.end(file.buffer);

    // Handle upload completion
    uploadStream.on('finish', async () => {
      const fileId = uploadStream.id;

      // Create media message with fileId (stored in DB, not URL)
      const message = new Message({
        sender,
        receiver,
        text: text || `📎 ${file.originalname}`, // Default caption with file name
        timestamp: new Date(),
        status: 'sent',
        media: {
          mediaType,
          fileId: fileId,
          fileName: file.originalname,
          fileSizeKB: Math.round(file.size / 1024),
          mimeType: file.mimetype
        }
      });

      try {
        await message.save();

        console.log(`✅ Media message saved:`);
        console.log(`   Type: ${mediaType}, File: ${file.originalname}`);
        console.log(`   FileID: ${fileId}, Type: ${typeof fileId}`);
        console.log(`   Message ID: ${message._id}`);
        console.log(`   Media field in DB:`, message.media);

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
          console.log(`📬 Media unread count: ${sender} → ${receiver}, count=${newCount}`);
          const unreadData = { senderUsername: sender, count: newCount };
          io.to(`user_${receiver}`).emit('unread-count-updated', unreadData);
          // Direct socket fallback
          const receiverSocketId = connectedUsers?.[receiver];
          if (receiverSocketId) {
            io.to(receiverSocketId).emit('unread-count-updated', unreadData);
          }
        }

        const messageObject = message.toObject();

        // Emit receive_message to receiver in real-time
        if (io) {
          io.to(`user_${receiver}`).emit('receive_message', messageObject);
          // Direct socket fallback
          const receiverSocketId = connectedUsers?.[receiver];
          if (receiverSocketId) {
            io.to(receiverSocketId).emit('receive_message', messageObject);
          }
        }

        res.status(201).json({
          message: 'Media uploaded successfully to database',
          data: message
        });
      } catch (error) {
        console.error('❌ Error saving message:', error.message);
        // Try to delete the file from GridFS if message save fails
        try {
          await gfs.delete(fileId);
        } catch (delError) {
          console.error('Error cleaning up GridFS file:', delError.message);
        }
        res.status(500).json({ 
          message: 'Error saving message', 
          error: error.message 
        });
      }
    });

    // Handle upload errors
    uploadStream.on('error', (error) => {
      console.error('❌ GridFS upload error:', error.message);
      res.status(500).json({ 
        message: 'File upload error', 
        error: error.message 
      });
    });

  } catch (error) {
    console.error('❌ Media upload error:', error.message);
    res.status(500).json({ 
      message: 'Media upload error', 
      error: error.message 
    });
  }
});

// Download media file from GridFS
router.get('/download/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;

    console.log(`📥 Download request for fileId: ${fileId}`);

    // Validate fileId format
    if (!fileId.match(/^[0-9a-fA-F]{24}$/)) {
      console.error(`❌ Invalid file ID format: ${fileId}`);
      return res.status(400).json({ message: 'Invalid file ID' });
    }

    if (!gfs || !isGridFSReady) {
      console.error('❌ GridFS bucket not initialized');
      return res.status(503).json({ 
        message: 'File storage system not ready' 
      });
    }

    // Get file info from GridFS
    const files = await gfs.find({
      _id: new mongoose.Types.ObjectId(fileId)
    }).toArray();

    if (!files || files.length === 0) {
      console.error(`❌ File not found in GridFS: ${fileId}`);
      return res.status(404).json({ message: 'File not found' });
    }

    const file = files[0];
    console.log(`✅ File found: ${file.filename} (${file.length} bytes)`);

    // Set proper headers for streaming media
    res.setHeader('Content-Type', file.metadata?.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
    res.setHeader('Content-Length', file.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');

    // Stream file from GridFS
    const downloadStream = gfs.openDownloadStream(new mongoose.Types.ObjectId(fileId));
    
    downloadStream.on('error', (error) => {
      console.error('❌ Stream error downloading file:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error downloading file' });
      }
    });

    downloadStream.on('end', () => {
      console.log(`✅ File download completed: ${file.filename}`);
    });

    downloadStream.pipe(res);

  } catch (error) {
    console.error('❌ Download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ 
        message: 'Download error', 
        error: error.message 
      });
    }
  }
});

module.exports = router;
