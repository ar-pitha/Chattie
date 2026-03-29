import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import MessageInput from '../components/MessageInput';
import AppLockModal from '../components/AppLockModal';
import Settings from '../components/Settings';
import { authAPI, usersAPI, chatAPI } from '../utils/api';
import { disconnectSocket, emitUserLogout, initializeSocket, emitUserJoin, onUnreadCountUpdated, onUnreadCountCleared, emitClearUnreadCount, onUserOnline, onUserOffline, onTypingIndicator, onStopTyping, emitUserAway, emitUserBack, onReceiveMessage } from '../utils/socket';
import { setupForegroundNotifications, requestFCMToken, registerServiceWorker } from '../utils/firebase';
import { useAppSecurity, setAppLockSession, wasAppLocked } from '../utils/security';
import '../styles/ChatPage.css';

const ChatPage = ({ currentUser, onLogout }) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [appLockModalOpen, setAppLockModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [hasAppLock, setHasAppLock] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  // Track who is typing (for sidebar display)
  const [typingUsers, setTypingUsers] = useState({});
  // Track last message per user for sidebar display and sorting
  // { username: { text, sender, timestamp, status } }
  const [lastMessages, setLastMessages] = useState({});
  // Keep lastMessageTimes derived from lastMessages for sorting
  const lastMessageTimes = React.useMemo(() => {
    const times = {};
    Object.entries(lastMessages).forEach(([user, msg]) => {
      times[user] = new Date(msg.timestamp).getTime();
    });
    return times;
  }, [lastMessages]);

  const handleClearUnread = useCallback((username) => {
    setUnreadCounts((prev) => { const u = { ...prev }; delete u[username]; return u; });
  }, []);

  const handleReply = useCallback((msg) => setReplyingTo(msg), []);

  const handleSelectUser = useCallback((user) => {
    setSelectedUser(user);
    setReplyingTo(null);
  }, []);

  const handleBack = useCallback(() => { setSelectedUser(null); setReplyingTo(null); }, []);

  const handleMessageSent = useCallback((message) => {
    setMessages((prev) => [...prev, message]);
    // Update last message for the receiver (for sidebar display and sorting)
    if (message.receiver) {
      setLastMessages((prev) => ({
        ...prev,
        [message.receiver]: { text: message.text, sender: message.sender, timestamp: message.timestamp || new Date().toISOString(), status: message.status || 'sent' }
      }));
    }
  }, []);

  useEffect(() => {
    if (selectedUser) emitClearUnreadCount(currentUser.username, selectedUser.username);
  }, [selectedUser?.username, currentUser.username]);

  useEffect(() => {
    const checkAppLock = async () => {
      try {
        const res = await authAPI.checkAppLock(currentUser.username);
        const enabled = res.data?.hasAppLock === true;
        setHasAppLock(enabled);
        if (enabled && wasAppLocked(currentUser.username)) setAppLockModalOpen(true);
        else if (enabled) setAppLockSession(currentUser.username);
      } catch { setHasAppLock(false); }
    };
    if (currentUser?.username) checkAppLock();
  }, [currentUser.username]);

  useAppSecurity(currentUser.username, hasAppLock, () => setAppLockModalOpen(true));

  // WhatsApp-style online/offline: online only when tab is visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        emitUserAway(currentUser.username);
      } else {
        emitUserBack(currentUser.username);
      }
    };

    // Tab/window close: sendBeacon as backup to guarantee offline in DB
    // Must use text/plain to avoid CORS preflight (sendBeacon can't do preflight)
    const handleBeforeUnload = () => {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      navigator.sendBeacon(
        `${apiUrl}/auth/go-offline`,
        JSON.stringify({ username: currentUser.username })
      );
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUser.username]);

  useEffect(() => {
    initializeSocket();
    emitUserJoin(currentUser.username);
    setupForegroundNotifications(() => {});
    const initFCM = async () => {
      try {
        const sw = await registerServiceWorker();
        if (!sw) return;
        let r = 0;
        while (!sw.active && r < 10) { await new Promise(res => setTimeout(res, 500)); r++; }
        if (!sw.active) return;
        const token = await requestFCMToken();
        if (token && currentUser._id) await authAPI.updateFCMToken(currentUser._id, token);
      } catch (e) { console.error('FCM init failed:', e); }
    };
    initFCM();
  }, [currentUser._id, currentUser.username]);

  useEffect(() => {
    if (currentUser._id) {
      usersAPI.getUnreadCounts(currentUser._id)
        .then(r => setUnreadCounts(r.data.unreadCounts || {}))
        .catch(() => {});
    }
  }, [currentUser._id]);

  // Fetch last messages for sidebar display
  useEffect(() => {
    if (currentUser.username) {
      chatAPI.getLastMessages(currentUser.username)
        .then(r => setLastMessages(r.data || {}))
        .catch(() => {});
    }
  }, [currentUser.username]);

  // Real-time online/offline: update BOTH users list and selectedUser
  useEffect(() => {
    const unsubOn = onUserOnline((data) => {
      setUsers((prev) => prev.map((u) => u.username === data.username ? { ...u, isOnline: true } : u));
      setSelectedUser((prev) => prev && prev.username === data.username ? { ...prev, isOnline: true } : prev);
    });
    const unsubOff = onUserOffline((data) => {
      setUsers((prev) => prev.map((u) => u.username === data.username ? { ...u, isOnline: false } : u));
      setSelectedUser((prev) => prev && prev.username === data.username ? { ...prev, isOnline: false } : prev);
    });
    return () => { unsubOn(); unsubOff(); };
  }, []);

  // Update lastMessages when receiving a new message (for sidebar preview on both sides)
  useEffect(() => {
    const unsub = onReceiveMessage((message) => {
      if (message.receiver === currentUser.username) {
        // Incoming message: key by sender
        setLastMessages((prev) => ({
          ...prev,
          [message.sender]: { text: message.text, sender: message.sender, timestamp: message.timestamp || new Date().toISOString(), status: message.status || 'sent' }
        }));
      }
    });
    return unsub;
  }, [currentUser.username]);

  // Unread count socket listeners — single source of truth from backend
  useEffect(() => {
    const u1 = onUnreadCountUpdated((d) => {
      setUnreadCounts((p) => ({ ...p, [d.senderUsername]: d.count }));
    });
    const u2 = onUnreadCountCleared((d) => setUnreadCounts((p) => { const u = { ...p }; delete u[d.senderUsername]; return u; }));
    return () => { u1(); u2(); };
  }, []);

  // Typing indicators for sidebar (with auto-clear timeout as safety)
  const typingTimers = React.useRef({});
  useEffect(() => {
    const unsubTyping = onTypingIndicator((data) => {
      if (data.receiver === currentUser.username) {
        setTypingUsers((prev) => ({ ...prev, [data.username]: true }));
        // Auto-clear after 3s in case stop_typing event is missed
        if (typingTimers.current[data.username]) clearTimeout(typingTimers.current[data.username]);
        typingTimers.current[data.username] = setTimeout(() => {
          setTypingUsers((prev) => { const u = { ...prev }; delete u[data.username]; return u; });
        }, 3000);
      }
    });
    const unsubStop = onStopTyping((data) => {
      if (data.receiver === currentUser.username) {
        if (typingTimers.current[data.username]) clearTimeout(typingTimers.current[data.username]);
        setTypingUsers((prev) => { const u = { ...prev }; delete u[data.username]; return u; });
      }
    });
    return () => { unsubTyping(); unsubStop(); };
  }, [currentUser.username]);

  const handleLogout = async () => {
    try { await authAPI.logout(currentUser._id); emitUserLogout(currentUser.username); disconnectSocket(); } catch {}
    onLogout();
  };

  const isChatOpen = selectedUser !== null;

  return (
    <div className="chat-page">
      <AppLockModal username={currentUser.username} onUnlock={() => { setAppLockSession(currentUser.username); setAppLockModalOpen(false); }} isOpen={appLockModalOpen} />
      <Settings currentUsername={currentUser.username} isOpen={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} hasAppLock={hasAppLock} onAppLockChange={(e) => setHasAppLock(e)} />

      <div className={`app-header ${isChatOpen ? 'chat-open' : ''}`}>
        <div className="header-left">
          <span className="app-title">Chattie</span>
        </div>
        <div className="header-right">
          <button className="header-icon-btn" onClick={() => setSettingsModalOpen(true)} aria-label="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button className="header-icon-btn" onClick={handleLogout} aria-label="Logout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      <div className={`chat-container ${isChatOpen ? 'chat-open' : ''}`}>
        <div className="sidebar-panel">
          <Sidebar currentUser={currentUser} selectedUser={selectedUser} onSelectUser={handleSelectUser} users={users} setUsers={setUsers} unreadCounts={unreadCounts} typingUsers={typingUsers} lastMessageTimes={lastMessageTimes} lastMessages={lastMessages} />
        </div>
        <div className="chat-panel">
          <ChatWindow currentUser={currentUser} selectedUser={selectedUser} messages={messages} setMessages={setMessages} onReply={handleReply} unreadCounts={unreadCounts} onClearUnread={handleClearUnread} onBack={handleBack} />
          {selectedUser && (
            <MessageInput currentUser={currentUser} selectedUser={selectedUser} onMessageSent={handleMessageSent} replyingTo={replyingTo} onReplyCancel={() => setReplyingTo(null)} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
