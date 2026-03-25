import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket = null;
let currentUsername = null;

export const initializeSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      // Transport options - polling is more reliable on free tiers like Render
      transports: ['websocket', 'polling'],
      
      // Reconnection settings for production
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      
      // Improve connection stability
      path: '/socket.io/',
      
      // For HTTPS (production)
      secure: SOCKET_URL.startsWith('https'),
      rejectUnauthorized: false,
      
      // Handle connection timeouts
      connectTimeout: 10000
    });

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      // Re-emit user_join if we have a username stored
      if (currentUsername) {
        console.log(`🔄 Socket reconnected, re-emitting user_join for ${currentUsername}`);
        socket.emit('user_join', { username: currentUsername });
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from socket');
    });
  }

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

export const emitUserJoin = (username) => {
  currentUsername = username; // Store for reconnection
  const socket = getSocket();
  console.log(`👤 Registering user: ${username}, socket ID: ${socket.id}, connected: ${socket.connected}`);
  
  // Emit immediately and ensure it's sent
  socket.emit('user_join', { username });
  console.log(`✅ user_join event emitted for ${username}`);
};

export const emitSendMessage = (sender, receiver, text, replyTo = null, messageData = null) => {
  const socket = getSocket();
  // If we have the full saved message, emit that instead (includes _id)
  if (messageData) {
    socket.emit('send_message', messageData);
  } else {
    socket.emit('send_message', { sender, receiver, text, replyTo });
  }
};

export const emitDeleteMessage = (messageId) => {
  const socket = getSocket();
  socket.emit('delete_message', { messageId });
};

export const emitDeleteMessageForMe = (messageId, username) => {
  const socket = getSocket();
  socket.emit('delete_message_for_me', { messageId, username });
};

export const emitTyping = (username, receiver) => {
  const socket = getSocket();
  socket.emit('user_typing', { username, receiver });
};

export const emitStopTyping = (username, receiver) => {
  const socket = getSocket();
  socket.emit('user_stop_typing', { username, receiver });
};

export const emitMessageDelivered = (messageId, readerUsername, originalSenderUsername) => {
  const socket = getSocket();
  
  if (!socket) {
    console.error(`❌ Socket is null! Cannot emit message-delivered.`);
    return;
  }
  
  socket.emit('message-delivered', { 
    messageId,
    readerUsername,
    originalSenderUsername
  });
};

export const emitMessageSeen = (messageId, readerUsername, originalSenderUsername) => {
  const socket = getSocket();
  
  if (!socket) {
    console.error(`❌ Socket is null! Cannot emit message-seen.`);
    return;
  }
  
  // Validate messageId before emitting
  if (!messageId) {
    console.warn(`⚠️ Cannot emit message-seen: messageId is undefined`, { messageId, readerUsername, originalSenderUsername });
    return;
  }
  
  console.log(`📤 Emitting message-seen:`, { messageId: String(messageId), readerUsername, originalSenderUsername });
  
  socket.emit('message-seen', { 
    messageId: String(messageId),
    readerUsername,
    originalSenderUsername
  });
};

export const emitUserLogout = (username) => {
  const socket = getSocket();
  socket.emit('user_logout', { username });
};

export const onReceiveMessage = (callback) => {
  const socket = getSocket();
  socket.on('receive_message', callback);
  
  // Return unsubscribe function
  return () => {
    socket.off('receive_message', callback);
  };
};

export const onUserOnline = (callback) => {
  const socket = getSocket();
  socket.on('user_online', callback);
};

export const onUserOffline = (callback) => {
  const socket = getSocket();
  socket.on('user_offline', callback);
};

export const onTypingIndicator = (callback) => {
  const socket = getSocket();
  socket.on('typing_indicator', callback);
};

export const onStopTyping = (callback) => {
  const socket = getSocket();
  socket.on('stop_typing', callback);
};

export const onMessageStatusUpdated = (callback) => {
  const socket = getSocket();
  socket.on('message-status-updated', callback);
  
  // Return unsubscribe function
  return () => {
    socket.off('message-status-updated', callback);
  };
};

export const onDeleteMessage = (callback) => {
  const socket = getSocket();
  socket.on('message_deleted', callback);
};

export const onDeleteMessageForMe = (callback) => {
  const socket = getSocket();
  socket.on('message_deleted_for_me', callback);
};

// WebRTC Call Events
export const emitCallUser = (to, from, offer) => {
  const socket = getSocket();
  socket.emit('call-user', { to, from, offer });
};

export const onCallUser = (callback) => {
  const socket = getSocket();
  socket.on('call-user', callback);
};

export const emitAnswerCall = (to, from, answer) => {
  const socket = getSocket();
  socket.emit('answer-call', { to, from, answer });
};

export const onAnswerCall = (callback) => {
  const socket = getSocket();
  socket.on('answer-call', callback);
};

export const emitIceCandidate = (to, candidate) => {
  const socket = getSocket();
  socket.emit('ice-candidate', { to, candidate });
};

export const onIceCandidate = (callback) => {
  const socket = getSocket();
  socket.on('ice-candidate', callback);
};

export const emitEndCall = (to, from, reason) => {
  const socket = getSocket();
  socket.emit('end-call', { to, from, reason });
};

export const onEndCall = (callback) => {
  const socket = getSocket();
  socket.on('end-call', callback);
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
