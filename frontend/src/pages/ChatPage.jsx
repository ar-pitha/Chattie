import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import MessageInput from '../components/MessageInput';
import { authAPI, usersAPI } from '../utils/api';
import { disconnectSocket, emitUserLogout, initializeSocket, emitUserJoin } from '../utils/socket';
import { setupForegroundNotifications, requestFCMToken, registerServiceWorker } from '../utils/firebase';
import '../styles/ChatPage.css';

const ChatPage = ({ currentUser, onLogout }) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    // Initialize Socket.IO when ChatPage loads (for page refreshes)
    const socket = initializeSocket();
    console.log('🔌 Socket.IO initialized for restored session');
    
    // Emit user join to notify others
    emitUserJoin(currentUser.username);

    // Setup foreground notifications
    setupForegroundNotifications((notification) => {
      console.log('🔔 Notification received:', notification);
      if (notification.notification) {
        alert(`💬 ${notification.notification.title}\n${notification.notification.body}`);
      }
    });

    // Try to update FCM token on page load
    (async () => {
      try {
        await registerServiceWorker();
        const fcmToken = await requestFCMToken();
        if (fcmToken && currentUser._id) {
          await authAPI.updateFCMToken(currentUser._id, fcmToken);
          console.log('✅ FCM token updated on page load');
        }
      } catch (error) {
        console.warn('Could not update FCM token:', error.message);
      }
    })();

    return () => {
      // Cleanup on unmount
      // Don't disconnect socket - just remove listener
    };
  }, [currentUser._id, currentUser.username]);

  const handleLogout = async () => {
    try {
      await authAPI.logout(currentUser._id);
      emitUserLogout(currentUser.username);
      disconnectSocket();
      onLogout();
    } catch (error) {
      console.error('Logout error:', error);
      onLogout();
    }
  };

  const handleMessageSent = (message) => {
    setMessages((prev) => [...prev, message]);
  };

  return (
    <div className="chat-page">
      <Sidebar
        currentUser={currentUser}
        selectedUser={selectedUser}
        onSelectUser={setSelectedUser}
        users={users}
        setUsers={setUsers}
      />

      <div className="chat-main">
        <ChatWindow
          currentUser={currentUser}
          selectedUser={selectedUser}
          messages={messages}
          setMessages={setMessages}
        />

        {selectedUser && (
          <MessageInput
            currentUser={currentUser}
            selectedUser={selectedUser}
            onMessageSent={handleMessageSent}
          />
        )}
      </div>

      <button className="logout-btn" onClick={handleLogout}>
        Logout
      </button>
    </div>
  );
};

export default ChatPage;
