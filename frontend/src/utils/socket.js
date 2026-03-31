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

export const onSocketConnect = (callback) => {
  const socket = getSocket();
  socket.on('connect', callback);
  return () => socket.off('connect', callback);
};

export const emitUserJoin = (username) => {
  currentUsername = username; // Store for reconnection
  const socket = getSocket();
  socket.emit('user_join', { username });
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

export const emitDeleteMessage = (messageId, sender, receiver) => {
  const socket = getSocket();
  socket.emit('delete_message', { messageId, sender, receiver });
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
  if (!socket) return;
  socket.emit('message-delivered', { messageId, readerUsername, originalSenderUsername });
};

export const emitMessageSeen = (messageId, readerUsername, originalSenderUsername) => {
  const socket = getSocket();
  if (!socket || !messageId) return;
  socket.emit('message-seen', { messageId: String(messageId), readerUsername, originalSenderUsername });
};

export const emitMessageSeenBatch = (messageIds, readerUsername, originalSenderUsername) => {
  const socket = getSocket();
  if (!socket || !messageIds || !messageIds.length) return;
  socket.emit('messages-seen-batch', { messageIds, readerUsername, originalSenderUsername });
};

export const onMessagesStatusBatchUpdated = (callback) => {
  const socket = getSocket();
  socket.on('messages-status-batch-updated', callback);
  return () => socket.off('messages-status-batch-updated', callback);
};

export const emitUserLogout = (username) => {
  const socket = getSocket();
  socket.emit('user_logout', { username });
};

export const emitUserAway = (username) => {
  const socket = getSocket();
  socket.emit('user_away', { username });
};

export const emitUserBack = (username) => {
  const socket = getSocket();
  socket.emit('user_back', { username });
};

// Unread count events
export const emitClearUnreadCount = (username, senderUsername) => {
  const socket = getSocket();
  socket.emit('clear-unread-count', { username, senderUsername });
};

export const emitUnreadCountUpdate = (receiverUsername, senderUsername, count) => {
  const socket = getSocket();
  socket.emit('unread-count-update', { receiverUsername, senderUsername, count });
};

export const onUnreadCountUpdated = (callback) => {
  const socket = getSocket();
  socket.on('unread-count-updated', callback);
  
  // Return unsubscribe function
  return () => {
    socket.off('unread-count-updated', callback);
  };
};

export const onUnreadCountCleared = (callback) => {
  const socket = getSocket();
  socket.on('unread-count-cleared', callback);
  
  // Return unsubscribe function
  return () => {
    socket.off('unread-count-cleared', callback);
  };
};

export const onReceiveMessage = (callback) => {
  const socket = getSocket();
  socket.on('receive_message', callback);
  return () => socket.off('receive_message', callback);
};

export const onUserOnline = (callback) => {
  const socket = getSocket();
  socket.on('user_online', callback);
  return () => socket.off('user_online', callback);
};

export const onUserOffline = (callback) => {
  const socket = getSocket();
  socket.on('user_offline', callback);
  return () => socket.off('user_offline', callback);
};

export const onTypingIndicator = (callback) => {
  const socket = getSocket();
  socket.on('typing_indicator', callback);
  return () => socket.off('typing_indicator', callback);
};

export const onStopTyping = (callback) => {
  const socket = getSocket();
  socket.on('stop_typing', callback);
  return () => socket.off('stop_typing', callback);
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
  return () => socket.off('message_deleted', callback);
};

export const onDeleteMessageForMe = (callback) => {
  const socket = getSocket();
  socket.on('message_deleted_for_me', callback);
  return () => socket.off('message_deleted_for_me', callback);
};

// Message edit event
export const onMessageEdited = (callback) => {
  const socket = getSocket();
  socket.on('message_edited', callback);
  return () => socket.off('message_edited', callback);
};

// Message pin event
export const onMessagePinned = (callback) => {
  const socket = getSocket();
  socket.on('message_pinned', callback);
  return () => socket.off('message_pinned', callback);
};

// Emoji Reactions
export const onReactionUpdated = (callback) => {
  const socket = getSocket();
  socket.on('reaction_updated', callback);
  return () => socket.off('reaction_updated', callback);
};

// WebRTC Call Events
export const emitCallUser = (to, from, offer, callType = 'audio') => {
  const socket = getSocket();
  socket.emit('call-user', { to, from, offer, callType });
};

export const onCallUser = (callback) => {
  const socket = getSocket();
  socket.on('call-user', callback);
  return () => socket.off('call-user', callback);
};

export const emitAnswerCall = (to, from, answer) => {
  const socket = getSocket();
  socket.emit('answer-call', { to, from, answer });
};

export const onAnswerCall = (callback) => {
  const socket = getSocket();
  socket.on('answer-call', callback);
  return () => socket.off('answer-call', callback);
};

export const emitIceCandidate = (to, candidate) => {
  const socket = getSocket();
  socket.emit('ice-candidate', { to, candidate });
};

export const onIceCandidate = (callback) => {
  const socket = getSocket();
  socket.on('ice-candidate', callback);
  return () => socket.off('ice-candidate', callback);
};

export const emitEndCall = (to, from, reason) => {
  const socket = getSocket();
  socket.emit('end-call', { to, from, reason });
};

export const onEndCall = (callback) => {
  const socket = getSocket();
  socket.on('end-call', callback);
  return () => socket.off('end-call', callback);
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
