import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket = null;

export const initializeSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      console.log('Connected to socket:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from socket');
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

export const onDeleteMessage = (callback) => {
  const socket = getSocket();
  socket.on('message_deleted', callback);
};

export const onDeleteMessageForMe = (callback) => {
  const socket = getSocket();
  socket.on('message_deleted_for_me', callback);
};

export const emitStartCall = (caller, receiver) => {
  const socket = getSocket();
  socket.emit('start_call', { caller, receiver });
};

export const emitEndCall = (caller, receiver) => {
  const socket = getSocket();
  socket.emit('end_call', { caller, receiver });
};

export const onIncomingCall = (callback) => {
  const socket = getSocket();
  socket.on('incoming_call', callback);
};

export const onCallEnded = (callback) => {
  const socket = getSocket();
  socket.on('call_ended', callback);
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
