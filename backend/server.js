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
const io = socketIO(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Database
const connectDB = require('./config/database');
connectDB();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));
app.use(express.json());

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

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Chat Application Backend Running' });
});

// Socket.IO Events
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // When user joins
  socket.on('user_join', (data) => {
    console.log(`User ${data.username} joined with socket ${socket.id}`);
    socket.broadcast.emit('user_online', {
      username: data.username,
      status: 'online'
    });
  });

  // Send message event
  socket.on('send_message', (data) => {
    console.log(`Message from ${data.sender} to ${data.receiver}: ${data.text}`);
    
    // Emit to all OTHER clients (not back to sender)
    // Sender already added message locally via onMessageSent callback
    socket.broadcast.emit('receive_message', {
      sender: data.sender,
      receiver: data.receiver,
      text: data.text,
      timestamp: new Date()
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

  // User disconnects
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    socket.broadcast.emit('user_offline', {
      socketId: socket.id,
      status: 'offline'
    });
  });

  // Explicit logout
  socket.on('user_logout', (data) => {
    console.log(`User ${data.username} logged out`);
    socket.broadcast.emit('user_offline', {
      username: data.username,
      status: 'offline'
    });
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

module.exports = { app, io };
