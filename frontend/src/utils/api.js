import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export const authAPI = {
  register: (username, password) =>
    axios.post(`${API_BASE_URL}/auth/register`, { username, password }),

  login: (username, password) =>
    axios.post(`${API_BASE_URL}/auth/login`, { username, password }),

  logout: (userId) =>
    axios.post(`${API_BASE_URL}/auth/logout`, { userId }),

  updateFCMToken: (userId, fcmToken) =>
    axios.post(`${API_BASE_URL}/auth/update-fcm-token`, { userId, fcmToken }),

  setAppLockPassword: (username, appLockPassword) =>
    axios.post(`${API_BASE_URL}/auth/set-app-lock`, { username, appLockPassword }),

  verifyAppLockPassword: (username, appLockPassword) =>
    axios.post(`${API_BASE_URL}/auth/verify-app-lock`, { username, appLockPassword }),

  checkAppLock: (username) =>
    axios.get(`${API_BASE_URL}/auth/check-app-lock`, { params: { username } }),

  toggleAppLock: (username, enabled) =>
    axios.post(`${API_BASE_URL}/auth/toggle-app-lock`, { username, enabled })
};

export const usersAPI = {
  getAllUsers: (currentUserId) =>
    axios.get(`${API_BASE_URL}/users/all`, { params: { currentUserId } }),

  getUserById: (userId) =>
    axios.get(`${API_BASE_URL}/users/${userId}`),

  updateOnlineStatus: (userId, isOnline, socketId) =>
    axios.put(`${API_BASE_URL}/users/status`, { userId, isOnline, socketId }),

  getUnreadCounts: (userId) =>
    axios.get(`${API_BASE_URL}/users/${userId}/unread-counts`),

  clearUnreadCount: (userId, senderUsername) =>
    axios.post(`${API_BASE_URL}/users/unread-counts/clear`, { userId, senderUsername }),

  incrementUnreadCount: (userId, senderUsername) =>
    axios.post(`${API_BASE_URL}/users/unread-counts/increment`, { userId, senderUsername })
};

export const chatAPI = {
  getLastMessages: (username) =>
    axios.get(`${API_BASE_URL}/chat/last-messages/${username}`),

  getMessages: (sender, receiver) =>
    axios.get(`${API_BASE_URL}/chat/messages`, { params: { sender, receiver } }),

  saveMessage: (sender, receiver, text, replyTo = null) =>
    axios.post(`${API_BASE_URL}/chat/messages`, { sender, receiver, text, replyTo }),

  deleteMessage: (messageId) =>
    axios.delete(`${API_BASE_URL}/chat/messages/${messageId}`),

  deleteMessageForMe: (messageId, username) =>
    axios.post(`${API_BASE_URL}/chat/messages/delete-for-me`, { messageId, username }),

  // Debug: Check message structure and media fields
  debugMessagesWithMedia: (sender, receiver) =>
    axios.get(`${API_BASE_URL}/chat/debug/messages`, { params: { sender, receiver } })
};

export const mediaAPI = {
  uploadMedia: (file, sender, receiver, mediaType, text = '') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sender', sender);
    formData.append('receiver', receiver);
    formData.append('mediaType', mediaType);
    formData.append('text', text);

    return axios.post(`${API_BASE_URL}/media/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },

  uploadProfilePic: (file, userId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);
    return axios.post(`${API_BASE_URL}/media/profile-pic`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  deleteProfilePic: (userId) => {
    return axios.delete(`${API_BASE_URL}/media/profile-pic/${userId}`);
  },

  getProfilePicUrl: (fileId) => {
    if (!fileId) return null;
    return `${API_BASE_URL}/media/download/${fileId}`;
  }
};

export const notificationAPI = {
  sendNotification: (receiverId, title, body) =>
    axios.post(`${API_BASE_URL}/notifications/send`, { receiverId, title, body }),

  sendNotificationByUsername: (receiverUsername, sendersUsername, messageText) =>
    axios.post(`${API_BASE_URL}/notifications/send-by-username`, {
      receiverUsername,
      sendersUsername,
      messageText
    })
};

export const callAPI = {
  saveCall: (callerId, receiverId, duration, status = 'completed', networkQuality = 'good') =>
    axios.post(`${API_BASE_URL}/calls/save`, { 
      callerId, 
      receiverId, 
      duration, 
      status,
      networkQuality
    }),

  getCallHistory: (username, limit = 50) =>
    axios.get(`${API_BASE_URL}/calls/user/${username}`, { params: { limit } }),

  getCallHistoryWith: (username, otherUsername, limit = 50) =>
    axios.get(`${API_BASE_URL}/calls/between/${username}/${otherUsername}`, { params: { limit } }),

  deleteCall: (callId) =>
    axios.delete(`${API_BASE_URL}/calls/${callId}`),

  clearCallHistory: (username) =>
    axios.delete(`${API_BASE_URL}/calls/user/${username}/clear`)
};
