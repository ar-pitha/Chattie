import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import MessageInput from '../components/MessageInput';
import AppLockModal from '../components/AppLockModal';
import Settings from '../components/Settings';
import { authAPI, usersAPI, chatAPI } from '../utils/api';
import { disconnectSocket, emitUserLogout, initializeSocket, emitUserJoin, onUnreadCountUpdated, onUnreadCountCleared, emitClearUnreadCount, onUserOnline, onUserOffline, onTypingIndicator, onStopTyping, emitUserAway, emitUserBack, onReceiveMessage, onSocketConnect, onMessageStatusUpdated, onDeleteMessage, getSocket } from '../utils/socket';
import { setupForegroundNotifications, requestFCMToken, registerServiceWorker } from '../utils/firebase';
import { useAppSecurity, setAppLockSession, wasAppLocked } from '../utils/security';
import '../styles/ChatPage.css';

const ChatPage = ({ currentUser, onLogout, onCurrentUserUpdate }) => {
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
  const [scrollTrigger, setScrollTrigger] = useState(0);
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
  const [editingMessage, setEditingMessage] = useState(null);
  const handleEdit = useCallback((msg) => setEditingMessage(msg), []);

  const handleSelectUser = useCallback((user) => {
    setSelectedUser(user);
    setReplyingTo(null);
    setEditingMessage(null);
  }, []);

  const handleBack = useCallback(() => { setSelectedUser(null); setReplyingTo(null); setEditingMessage(null); }, []);

  const handleMessageSent = useCallback((message) => {
    setMessages((prev) => [...prev, message]);
    // Update last message for the receiver (for sidebar display and sorting)
    if (message.receiver) {
      setLastMessages((prev) => ({
        ...prev,
        [message.receiver]: { _id: message._id, text: message.text, sender: message.sender, timestamp: message.timestamp || new Date().toISOString(), status: message.status || 'sent' }
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

  // Fetch last messages and unread counts — also re-fetch on socket reconnect
  // (handles Render cold start where initial API call fails while backend wakes up)
  const fetchSidebarData = useCallback(() => {
    if (currentUser.username) {
      chatAPI.getLastMessages(currentUser.username)
        .then(r => setLastMessages(r.data || {}))
        .catch(() => {});
    }
    if (currentUser._id) {
      usersAPI.getUnreadCounts(currentUser._id)
        .then(r => setUnreadCounts(r.data.unreadCounts || {}))
        .catch(() => {});
    }
  }, [currentUser.username, currentUser._id]);

  useEffect(() => {
    fetchSidebarData();
  }, [fetchSidebarData]);

  useEffect(() => {
    return onSocketConnect(() => {
      fetchSidebarData();
    });
  }, [fetchSidebarData]);

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

  // Profile pic updates: listen for other users changing their pic
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = ({ username, profilePic }) => {
      setUsers((prev) => prev.map((u) => u.username === username ? { ...u, profilePic } : u));
      setSelectedUser((prev) => prev && prev.username === username ? { ...prev, profilePic } : prev);
    };
    socket.on('profile-pic-updated', handler);
    return () => socket.off('profile-pic-updated', handler);
  }, []);

  const handleProfilePicUpdate = useCallback((profilePic) => {
    onCurrentUserUpdate?.({ ...currentUser, profilePic });
  }, [currentUser, onCurrentUserUpdate]);

  // Update lastMessages when receiving a new message (for sidebar preview on both sides)
  useEffect(() => {
    const unsub = onReceiveMessage((message) => {
      if (message.receiver === currentUser.username) {
        // Incoming message: key by sender
        setLastMessages((prev) => ({
          ...prev,
          [message.sender]: { _id: message._id, text: message.text, sender: message.sender, timestamp: message.timestamp || new Date().toISOString(), status: message.status || 'sent' }
        }));
      }
    });
    return unsub;
  }, [currentUser.username]);

  // Sync lastMessages status with real-time status updates (sent→delivered→seen)
  useEffect(() => {
    return onMessageStatusUpdated((data) => {
      if (data.sender === currentUser.username) {
        setLastMessages((prev) => {
          const updated = { ...prev };
          Object.keys(updated).forEach((key) => {
            const msg = updated[key];
            if (msg._id && String(msg._id) === String(data.messageId)) {
              updated[key] = { ...msg, status: data.status };
            }
          });
          return updated;
        });
      }
    });
  }, [currentUser.username]);

  // Update sidebar when a message is deleted for all (real-time — other user deleted)
  useEffect(() => {
    return onDeleteMessage((d) => {
      // Figure out which conversation key to update
      const otherUser = d.sender === currentUser.username ? d.receiver : d.sender;
      if (!otherUser) return;
      setLastMessages((prev) => {
        if (!prev[otherUser]) return prev;
        return { ...prev, [otherUser]: { ...prev[otherUser], text: 'This message was deleted', deletedForAll: true } };
      });
    });
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

      <div className={`chat-container ${isChatOpen ? 'chat-open' : ''} ${settingsModalOpen ? 'settings-open' : ''}`}>
        <div className="sidebar-panel">
          {/* Mobile: settings replaces sidebar. Desktop: sidebar always visible */}
          {settingsModalOpen ? (
            <>
              {/* Mobile-only: settings inside sidebar */}
              <div className="sidebar settings-mobile-only">
                <div className="sidebar-top-header">
                  <span className="sidebar-app-title">Chattie</span>
                </div>
                <Settings currentUsername={currentUser.username} onClose={() => setSettingsModalOpen(false)} hasAppLock={hasAppLock} onAppLockChange={(e) => setHasAppLock(e)} />
              </div>
              {/* Desktop-only: keep sidebar visible */}
              <div className="settings-desktop-sidebar">
                <Sidebar currentUser={currentUser} selectedUser={selectedUser} onSelectUser={(user) => { setSettingsModalOpen(false); handleSelectUser(user); }} users={users} setUsers={setUsers} unreadCounts={unreadCounts} typingUsers={typingUsers} lastMessageTimes={lastMessageTimes} lastMessages={lastMessages} onSettingsOpen={() => setSettingsModalOpen(true)} onLogout={handleLogout} onProfilePicUpdate={handleProfilePicUpdate} />
              </div>
            </>
          ) : (
            <Sidebar currentUser={currentUser} selectedUser={selectedUser} onSelectUser={handleSelectUser} users={users} setUsers={setUsers} unreadCounts={unreadCounts} typingUsers={typingUsers} lastMessageTimes={lastMessageTimes} lastMessages={lastMessages} onSettingsOpen={() => setSettingsModalOpen(true)} onLogout={handleLogout} onProfilePicUpdate={handleProfilePicUpdate} />
          )}
        </div>
        <div className="chat-panel">
          {/* Desktop: settings in center area. Mobile: hidden when settings open */}
          {settingsModalOpen ? (
            <div className="settings-desktop-panel">
              <Settings currentUsername={currentUser.username} onClose={() => setSettingsModalOpen(false)} hasAppLock={hasAppLock} onAppLockChange={(e) => setHasAppLock(e)} />
            </div>
          ) : (
            <>
              <ChatWindow currentUser={currentUser} selectedUser={selectedUser} messages={messages} setMessages={setMessages} onReply={handleReply} onEdit={handleEdit} unreadCounts={unreadCounts} onClearUnread={handleClearUnread} onBack={handleBack} scrollTrigger={scrollTrigger} replyingTo={replyingTo} onMessageDeletedForAll={(otherUsername) => {
                setLastMessages((prev) => {
                  if (!prev[otherUsername]) return prev;
                  return { ...prev, [otherUsername]: { ...prev[otherUsername], text: 'This message was deleted', deletedForAll: true } };
                });
              }} />
              {selectedUser && (
                <MessageInput currentUser={currentUser} selectedUser={selectedUser} onMessageSent={handleMessageSent} replyingTo={replyingTo} onReplyCancel={() => setReplyingTo(null)} editingMessage={editingMessage} onEditCancel={() => setEditingMessage(null)} onEditDone={(msgId, newText) => { setMessages(prev => prev.map(m => String(m._id) === String(msgId) ? { ...m, text: newText, editedAt: new Date() } : m)); setEditingMessage(null); }} onMediaMenuToggle={(open) => { if (open) setScrollTrigger(s => s + 1); }} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
