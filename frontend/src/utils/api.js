import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Create axios instance with timeout and retry for Render free-tier cold starts
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // 15s timeout (Render cold start can take 10s)
});

// Retry interceptor: retry once on network error or 5xx (cold start recovery)
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const config = error.config;
    if (config._retried) return Promise.reject(error);

    const isRetryable =
      !error.response || // network error (Render sleeping)
      (error.response.status >= 500 && error.response.status < 600);

    if (isRetryable) {
      config._retried = true;
      await new Promise((r) => setTimeout(r, 1500)); // wait 1.5s for cold start
      return api(config);
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (username, password) =>
    api.post(`${API_BASE_URL}/auth/register`, { username, password }),

  login: (username, password) =>
    api.post(`${API_BASE_URL}/auth/login`, { username, password }),

  logout: (userId) =>
    api.post(`${API_BASE_URL}/auth/logout`, { userId }),

  updateFCMToken: (userId, fcmToken) =>
    api.post(`${API_BASE_URL}/auth/update-fcm-token`, { userId, fcmToken }),

  setAppLockPassword: (username, appLockPassword) =>
    api.post(`${API_BASE_URL}/auth/set-app-lock`, { username, appLockPassword }),

  verifyAppLockPassword: (username, appLockPassword) =>
    api.post(`${API_BASE_URL}/auth/verify-app-lock`, { username, appLockPassword }),

  checkAppLock: (username) =>
    api.get(`${API_BASE_URL}/auth/check-app-lock`, { params: { username } }),

  toggleAppLock: (username, enabled) =>
    api.post(`${API_BASE_URL}/auth/toggle-app-lock`, { username, enabled })
};

export const usersAPI = {
  getAllUsers: (currentUserId) =>
    api.get(`${API_BASE_URL}/users/all`, { params: { currentUserId } }),

  getUserById: (userId) =>
    api.get(`${API_BASE_URL}/users/${userId}`),

  updateOnlineStatus: (userId, isOnline, socketId) =>
    api.put(`${API_BASE_URL}/users/status`, { userId, isOnline, socketId }),

  getUnreadCounts: (userId) =>
    api.get(`${API_BASE_URL}/users/${userId}/unread-counts`),

  clearUnreadCount: (userId, senderUsername) =>
    api.post(`${API_BASE_URL}/users/unread-counts/clear`, { userId, senderUsername }),

  incrementUnreadCount: (userId, senderUsername) =>
    api.post(`${API_BASE_URL}/users/unread-counts/increment`, { userId, senderUsername })
};

export const chatAPI = {
  getLastMessages: (username) =>
    api.get(`${API_BASE_URL}/chat/last-messages/${username}`),

  getMessages: (sender, receiver) =>
    api.get(`${API_BASE_URL}/chat/messages`, { params: { sender, receiver } }),

  saveMessage: (sender, receiver, text, replyTo = null) =>
    api.post(`${API_BASE_URL}/chat/messages`, { sender, receiver, text, replyTo }),

  deleteMessage: (messageId) =>
    api.delete(`${API_BASE_URL}/chat/messages/${messageId}`),

  deleteMessageForMe: (messageId, username) =>
    api.post(`${API_BASE_URL}/chat/messages/delete-for-me`, { messageId, username }),

  editMessage: (messageId, text, username) =>
    api.put(`${API_BASE_URL}/chat/messages/${messageId}/edit`, { text, username }),

  toggleStar: (messageId, username) =>
    api.post(`${API_BASE_URL}/chat/messages/${messageId}/star`, { username }),

  getStarredMessages: (username) =>
    api.get(`${API_BASE_URL}/chat/starred/${username}`),

  togglePin: (messageId, username) =>
    api.post(`${API_BASE_URL}/chat/messages/${messageId}/pin`, { username }),

  toggleReaction: (messageId, emoji, username) =>
    api.post(`${API_BASE_URL}/chat/messages/${messageId}/reaction`, { emoji, username }),

  getUnseenReactions: (username) =>
    api.get(`${API_BASE_URL}/chat/unseen-reactions/${username}`),

  markReactionsSeen: (username, otherUser) =>
    api.post(`${API_BASE_URL}/chat/reactions/mark-seen`, { username, otherUser }),

  getPinnedMessages: (user1, user2) =>
    api.get(`${API_BASE_URL}/chat/pinned`, { params: { user1, user2 } }),

  saveCallEvent: (sender, receiver, callType, duration, status) =>
    api.post(`${API_BASE_URL}/chat/call-event`, { sender, receiver, callType, duration, status }),

  debugMessagesWithMedia: (sender, receiver) =>
    api.get(`${API_BASE_URL}/chat/debug/messages`, { params: { sender, receiver } })
};

export const mediaAPI = {
  uploadMedia: (file, sender, receiver, mediaType, text = '') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sender', sender);
    formData.append('receiver', receiver);
    formData.append('mediaType', mediaType);
    formData.append('text', text);

    return api.post(`${API_BASE_URL}/media/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // 60s for file uploads
    });
  },

  uploadProfilePic: (file, userId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);
    return api.post(`${API_BASE_URL}/media/profile-pic`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  deleteProfilePic: (userId) => {
    return api.delete(`${API_BASE_URL}/media/profile-pic/${userId}`);
  },

  getProfilePicUrl: (fileId) => {
    if (!fileId) return null;
    return `${API_BASE_URL}/media/download/${fileId}`;
  }
};

export const notificationAPI = {
  sendNotification: (receiverId, title, body) =>
    api.post(`${API_BASE_URL}/notifications/send`, { receiverId, title, body }),

  sendNotificationByUsername: (receiverUsername, sendersUsername, messageText) =>
    api.post(`${API_BASE_URL}/notifications/send-by-username`, {
      receiverUsername,
      sendersUsername,
      messageText
    })
};

export const callAPI = {
  saveCall: (callerId, receiverId, duration, status = 'completed', networkQuality = 'good') =>
    api.post(`${API_BASE_URL}/calls/save`, { 
      callerId, 
      receiverId, 
      duration, 
      status,
      networkQuality
    }),

  getCallHistory: (username, limit = 50) =>
    api.get(`${API_BASE_URL}/calls/user/${username}`, { params: { limit } }),

  getCallHistoryWith: (username, otherUsername, limit = 50) =>
    api.get(`${API_BASE_URL}/calls/between/${username}/${otherUsername}`, { params: { limit } }),

  deleteCall: (callId) =>
    api.delete(`${API_BASE_URL}/calls/${callId}`),

  clearCallHistory: (username) =>
    api.delete(`${API_BASE_URL}/calls/user/${username}/clear`)
};
