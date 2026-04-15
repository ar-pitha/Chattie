const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
const server = http.createServer(app);
const allowedOriginsIO = [
  'http://localhost:5173',      // Local development
  'http://192.168.29.61:5173',  // Mobile testing on LAN
  'https://chattie-five.vercel.app',
  process.env.FRONTEND_URL      // Deployed frontend
].filter(Boolean);              // Remove undefined values

const io = socketIO(server, {
  cors: {
    origin: allowedOriginsIO,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  // Polling support for stability on free tiers (Render)
  transports: ['websocket', 'polling'],
  
  // Connection handling - detect disconnects faster
  pingTimeout: 20000,
  pingInterval: 10000,
  
  // Allow many connections
  maxHttpBufferSize: 1e6
});

// Database
const connectDB = require('./config/database');
connectDB();

// Models
const Message = require('./models/Message');

// Middleware
const allowedOrigins = [
  'http://localhost:5173',      // Local development
  'http://192.168.29.61:5173',  // Mobile testing on LAN
  'https://chattie-five.vercel.app',
  process.env.FRONTEND_URL      // Deployed frontend
].filter(Boolean);              // Remove undefined values

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));

// Request logging middleware — skip noisy routes on free tier
app.use((req, res, next) => {
  if (req.path !== '/socket.io/' && req.path !== '/') {
    console.log(`${req.method} ${req.path}`);
  }
  next();
});

// Routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const chatRoutes = require('./routes/chat');
const notificationRoutes = require('./routes/notification');
const callHistoryRoutes = require('./routes/callHistory');
const mediaRoutes = require('./routes/media');
const chatController = require('./controllers/chatController');
const authController = require('./controllers/authController');

// Track connected users: { username: socketId }
const connectedUsers = {};

// Initialize controllers with io instance and connectedUsers map for real-time updates
chatController.setIO(io, connectedUsers);
authController.setIO(io, connectedUsers);
mediaRoutes.setIO(io, connectedUsers);

// Note: No static file serving needed - files are now stored in MongoDB GridFS

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/calls', callHistoryRoutes);
app.use('/api/media', mediaRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Chat Application Backend Running' });
});

// Socket.IO Events
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // When user joins
  socket.on('user_join', (data) => {
    const { username } = data;
    connectedUsers[username] = socket.id;
    socket.join(`user_${username}`);

    // Mark online in DB
    const User = require('./models/User');
    User.findOneAndUpdate({ username }, { isOnline: true }).catch(() => {});

    socket.broadcast.emit('user_online', { username });
  });

  // Delete message for everyone — send only to the other user in the conversation
  socket.on('delete_message', (data) => {
    const { messageId, sender, receiver } = data;
    const payload = { messageId, sender, receiver };
    io.to(`user_${sender}`).emit('message_deleted', payload);
    io.to(`user_${receiver}`).emit('message_deleted', payload);
  });

  // Delete message for me only — send back to the same user's other tabs
  socket.on('delete_message_for_me', (data) => {
    io.to(`user_${data.username}`).emit('message_deleted_for_me', {
      messageId: data.messageId,
      username: data.username
    });
  });

  // Typing indicator — send only to the intended receiver
  socket.on('user_typing', (data) => {
    io.to(`user_${data.receiver}`).emit('typing_indicator', {
      username: data.username,
      receiver: data.receiver
    });
  });

  // Stop typing — send only to the intended receiver
  socket.on('user_stop_typing', (data) => {
    io.to(`user_${data.receiver}`).emit('stop_typing', {
      username: data.username,
      receiver: data.receiver
    });
  });

  // Mark messages as delivered (when receiver opens the app)
  socket.on('message-delivered', (data) => {
    const { readerUsername, originalSenderUsername, messageId } = data;

    // Update message status to delivered
    Message.findByIdAndUpdate(messageId, { status: 'delivered' }).catch(() => {});

    // Notify sender that message was delivered
    const deliveryData = { messageId, sender: originalSenderUsername, receiver: readerUsername, status: 'delivered' };
    io.to(`user_${originalSenderUsername}`).emit('message-status-updated', deliveryData);
  });

  // Mark messages as seen (when receiver opens the chat)
  socket.on('message-seen', (data) => {
    const { messageId, readerUsername, originalSenderUsername } = data;

    Message.findByIdAndUpdate(messageId, { status: 'seen' })
      .then(() => {
        const seenData = { messageId, sender: originalSenderUsername, receiver: readerUsername, status: 'seen' };
        io.to(`user_${originalSenderUsername}`).emit('message-status-updated', seenData);
      })
      .catch(() => {});
  });

  // Batch mark messages as seen (reduces socket spam when opening a chat)
  socket.on('messages-seen-batch', (data) => {
    const { messageIds, readerUsername, originalSenderUsername } = data;
    if (!messageIds || !messageIds.length) return;

    Message.updateMany(
      { _id: { $in: messageIds }, status: { $ne: 'seen' } },
      { status: 'seen' }
    ).then(() => {
      const seenData = { messageIds, sender: originalSenderUsername, receiver: readerUsername, status: 'seen' };
      io.to(`user_${originalSenderUsername}`).emit('messages-status-batch-updated', seenData);
    }).catch(() => {});
  });

  // Clear unread count when user opens chat
  socket.on('clear-unread-count', async (data) => {
    const { username, senderUsername } = data;

    // Persist to DB - remove this sender's count
    try {
      const User = require('./models/User');
      await User.findOneAndUpdate(
        { username },
        { $unset: { [`unreadCounts.${senderUsername}`]: 1 } }
      );
    } catch (err) {
      console.error('Error clearing unread count in DB:', err.message);
    }

    // Broadcast to the user so their UI updates
    io.to(`user_${username}`).emit('unread-count-cleared', {
      senderUsername
    });
  });

  // User goes away (tab hidden / minimized) - WhatsApp-style: only "online" when tab is visible
  socket.on('user_away', (data) => {
    const { username } = data;
    if (username) {
      const User = require('./models/User');
      User.findOneAndUpdate({ username }, { isOnline: false }).catch(() => {});
      socket.broadcast.emit('user_offline', { username });
    }
  });

  // User comes back (tab visible again)
  socket.on('user_back', (data) => {
    const { username } = data;
    if (username) {
      connectedUsers[username] = socket.id;
      socket.join(`user_${username}`);
      const User = require('./models/User');
      User.findOneAndUpdate({ username }, { isOnline: true }).catch(() => {});
      socket.broadcast.emit('user_online', { username });
    }
  });

  // User disconnects (close tab / lose connection)
  socket.on('disconnect', () => {
    let disconnectedUser = null;
    for (const [username, socketId] of Object.entries(connectedUsers)) {
      if (socketId === socket.id) {
        disconnectedUser = username;
        delete connectedUsers[username];
        break;
      }
    }
    if (disconnectedUser) {
      const User = require('./models/User');
      User.findOneAndUpdate({ username: disconnectedUser }, { isOnline: false }).catch(() => {});
      socket.broadcast.emit('user_offline', { username: disconnectedUser });
    }
  });

  // Explicit logout
  socket.on('user_logout', (data) => {
    delete connectedUsers[data.username];
    const User = require('./models/User');
    User.findOneAndUpdate({ username: data.username }, { isOnline: false }).catch(() => {});
    socket.broadcast.emit('user_offline', { username: data.username });
  });

  // WebRTC Call Events — room-based delivery
  socket.on('call-user', (data) => {
    const { to, from, offer, callType = 'audio' } = data;
    if (connectedUsers[to]) {
      io.to(`user_${to}`).emit('call-user', { from, offer, callType });
    } else {
      io.to(socket.id).emit('user-offline', { message: `${to} is offline` });
    }
  });

  socket.on('answer-call', (data) => {
    const { to, from, answer } = data;
    io.to(`user_${to}`).emit('answer-call', { from, answer });
  });

  socket.on('ice-candidate', (data) => {
    const { to, candidate } = data;
    if (candidate) io.to(`user_${to}`).emit('ice-candidate', { candidate });
  });

  socket.on('end-call', (data) => {
    const { to, from, reason } = data;
    io.to(`user_${to}`).emit('end-call', { from, reason });
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Global error handler:', err);
  res.status(err.status || 500).json({
    message: 'Server error',
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

module.exports = { app, io };
