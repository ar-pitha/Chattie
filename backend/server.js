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
  process.env.FRONTEND_URL      // Deployed frontend
].filter(Boolean);              // Remove undefined values

const io = socketIO(server, {
  cors: {
    origin: allowedOriginsIO,
    methods: ['GET', 'POST'],
    credentials: true
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
  process.env.FRONTEND_URL      // Deployed frontend
].filter(Boolean);              // Remove undefined values

app.use(cors({
  origin: allowedOrigins
}));
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📍 ${req.method} ${req.path}`);
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
    console.log(`👤 User joined: ${username} (socket ID: ${socket.id})`);
    console.log(`📋 Connected users:`, Object.keys(connectedUsers));
    console.log(`🏠 Socket joined room: user_${username}`);

    // Mark online in DB
    const User = require('./models/User');
    User.findOneAndUpdate({ username }, { isOnline: true }).catch(() => {});

    socket.broadcast.emit('user_online', { username });
  });

  // Delete message for everyone
  socket.on('delete_message', (data) => {
    console.log(`Message ${data.messageId} deleted by user`);
    socket.broadcast.emit('message_deleted', {
      messageId: data.messageId,
      sender: data.sender,
      receiver: data.receiver
    });
  });

  // Delete message for me only
  socket.on('delete_message_for_me', (data) => {
    console.log(`Message ${data.messageId} deleted for ${data.username}`);
    socket.broadcast.emit('message_deleted_for_me', {
      messageId: data.messageId,
      username: data.username
    });
  });

  // Typing indicator
  socket.on('user_typing', (data) => {
    socket.broadcast.emit('typing_indicator', {
      username: data.username,
      receiver: data.receiver
    });
  });

  // Stop typing
  socket.on('user_stop_typing', (data) => {
    socket.broadcast.emit('stop_typing', {
      username: data.username,
      receiver: data.receiver
    });
  });

  // Mark messages as delivered (when receiver opens the app)
  socket.on('message-delivered', (data) => {
    const { readerUsername, originalSenderUsername, messageId } = data;
    console.log(`\n📦 message-delivered event received`);
    console.log(`   Reader (receiver): ${readerUsername}`);
    console.log(`   Sender: ${originalSenderUsername}`);
    console.log(`   Message ID: ${messageId}`);
    
    // Update message status to delivered
    Message.findByIdAndUpdate(messageId, { status: 'delivered' }, { new: true })
      .then(updatedMsg => {
        console.log(`   ✅ Updated message status to "delivered"`);
      })
      .catch(err => {
        console.error('❌ Error updating message status:', err.message);
      });
    
    // Notify sender that message was delivered
    const senderSocketId = connectedUsers?.[originalSenderUsername];
    const deliveryData = {
      messageId,
      sender: originalSenderUsername,
      receiver: readerUsername,
      status: 'delivered'
    };
    
    console.log(`   📤 Emitting message-status-updated to ${originalSenderUsername}`);
    
    if (senderSocketId) {
      io.to(senderSocketId).emit('message-status-updated', deliveryData);
      console.log(`   ✅ [DIRECT] Sent to socket`);
    }
    io.to(`user_${originalSenderUsername}`).emit('message-status-updated', deliveryData);
    console.log(`   ✅ [ROOM] Sent to user_${originalSenderUsername} room`);
  });

  // Mark messages as seen (when receiver opens the chat)
  socket.on('message-seen', (data) => {
    const { messageId, readerUsername, originalSenderUsername } = data;
    console.log(`\n👁️ message-seen event received`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Reader (receiver): ${readerUsername}`);
    console.log(`   Sender: ${originalSenderUsername}`);
    
    // Update the specific message to "seen"
    Message.findByIdAndUpdate(
      messageId,
      { status: 'seen' },
      { new: true }
    )
      .then(updatedMessage => {
        console.log(`   ✅ Updated message to "seen"`);
        
        // Notify sender that message was seen
        const senderSocketId = connectedUsers?.[originalSenderUsername];
        const seenData = {
          messageId: messageId,
          sender: originalSenderUsername,
          receiver: readerUsername,
          status: 'seen'
        };
        
        console.log(`   📤 Emitting message-status-updated to ${originalSenderUsername}`);
        
        if (senderSocketId) {
          io.to(senderSocketId).emit('message-status-updated', seenData);
          console.log(`   ✅ [DIRECT] Sent to socket ${senderSocketId}`);
        }
        io.to(`user_${originalSenderUsername}`).emit('message-status-updated', seenData);
        console.log(`   ✅ [ROOM] Sent to user_${originalSenderUsername} room`);
      })
      .catch(err => {
        console.error('❌ Error updating message status:', err.message);
      });
  });

  // Clear unread count when user opens chat
  socket.on('clear-unread-count', async (data) => {
    const { username, senderUsername } = data;
    console.log(`✅ clear-unread-count: ${username} cleared ${senderUsername}`);

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

  // WebRTC Call Events — use both direct socket + room for reliable delivery
  socket.on('call-user', (data) => {
    const { to, from, offer, callType = 'audio' } = data;
    const recipientSocketId = connectedUsers[to];

    console.log(`📞 Call: ${from} → ${to} (${callType})`);

    if (recipientSocketId) {
      const payload = { from, offer, callType };
      io.to(recipientSocketId).emit('call-user', payload);
      io.to(`user_${to}`).emit('call-user', payload);
      console.log(`   ✅ Call signal sent to ${to}`);
    } else {
      console.log(`   ❌ User ${to} not found`);
      io.to(socket.id).emit('user-offline', { message: `${to} is offline` });
    }
  });

  socket.on('answer-call', (data) => {
    const { to, from, answer } = data;
    const callerSocketId = connectedUsers[to];
    console.log(`✅ Call answered: ${from} → ${to}`);

    const payload = { from, answer };
    if (callerSocketId) io.to(callerSocketId).emit('answer-call', payload);
    io.to(`user_${to}`).emit('answer-call', payload);
  });

  socket.on('ice-candidate', (data) => {
    const { to, candidate } = data;
    if (!candidate) return;
    const targetSocketId = connectedUsers[to];

    const payload = { candidate };
    if (targetSocketId) io.to(targetSocketId).emit('ice-candidate', payload);
    io.to(`user_${to}`).emit('ice-candidate', payload);
  });

  socket.on('end-call', (data) => {
    const { to, from, reason } = data;
    console.log(`📵 Call ended: ${from} → ${to}${reason ? ` (${reason})` : ''}`);

    const payload = { from, reason };
    const targetSocketId = connectedUsers[to];
    if (targetSocketId) io.to(targetSocketId).emit('end-call', payload);
    io.to(`user_${to}`).emit('end-call', payload);
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
