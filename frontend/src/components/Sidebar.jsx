import React, { useEffect, useState, useMemo } from 'react';
import { usersAPI, mediaAPI } from '../utils/api';
import ProfilePicModal from './ProfilePicModal';
import '../styles/Sidebar.css';

const DefaultAvatar = () => (
  <svg className="default-avatar-svg" viewBox="0 0 212 212" width="100%" height="100%">
    <path fill="#DFE5E7" d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0z"/>
    <path fill="#fff" d="M106 45c20.4 0 37 16.6 37 37s-16.6 37-37 37-37-16.6-37-37 16.6-37 37-37zm0 100c33.1 0 60 14.3 60 32v8H46v-8c0-17.7 26.9-32 60-32z"/>
  </svg>
);

const Sidebar = ({ currentUser, selectedUser, onSelectUser, users, setUsers, unreadCounts, typingUsers, lastMessageTimes, lastMessages, onSettingsOpen, onLogout, onProfilePicUpdate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [profilePicModalOpen, setProfilePicModalOpen] = useState(false);
  const [viewingUserPic, setViewingUserPic] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await usersAPI.getAllUsers(currentUser._id);
        setUsers(response.data);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };
    fetchUsers();
  }, [currentUser._id, setUsers]);

  // Sort: unread first, then by last message time (most recent first)
  const sortedUsers = useMemo(() => {
    const filtered = users.filter((user) =>
      user && user.username && user.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return [...filtered].sort((a, b) => {
      const unreadA = unreadCounts?.[a.username] || 0;
      const unreadB = unreadCounts?.[b.username] || 0;

      // Unread messages first
      if (unreadA > 0 && unreadB === 0) return -1;
      if (unreadB > 0 && unreadA === 0) return 1;

      // Then by last message time (most recent first)
      const timeA = lastMessageTimes?.[a.username] || 0;
      const timeB = lastMessageTimes?.[b.username] || 0;
      if (timeA !== timeB) return timeB - timeA;

      // Then online users before offline
      if (a.isOnline && !b.isOnline) return -1;
      if (b.isOnline && !a.isOnline) return 1;

      return 0;
    });
  }, [users, searchTerm, unreadCounts, lastMessageTimes]);

  const formatMsgTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const oneDay = 86400000;

    // Today — show time
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    // Within last 7 days — show day name
    if (diff < 7 * oneDay) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    // Older — show date
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const getProfilePicUrl = (profilePic) => mediaAPI.getProfilePicUrl(profilePic);

  const handleSaveProfilePic = async (file) => {
    const res = await mediaAPI.uploadProfilePic(file, currentUser._id);
    onProfilePicUpdate?.(res.data.profilePic);
  };

  const handleDeleteProfilePic = async () => {
    await mediaAPI.deleteProfilePic(currentUser._id);
    onProfilePicUpdate?.(null);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-top-header">
        <span className="sidebar-app-title">Chattie</span>
      </div>
      <div className="search-wrapper">
        <div className="search-box-container">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            className="search-box"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="users-list">
        {sortedUsers.length === 0 ? (
          <div className="sidebar-empty">No users found</div>
        ) : (
          sortedUsers.map((user) => {
            const unreadCount = unreadCounts?.[user.username] || 0;
            const isUserTyping = typingUsers?.[user.username] || false;

            return (
              <div
                key={user._id}
                className={`user-item ${selectedUser?._id === user._id ? 'active' : ''}`}
                onClick={() => onSelectUser(user)}
              >
                <div className="user-avatar" onClick={(e) => { e.stopPropagation(); setViewingUserPic(user); }}>
                  {user.profilePic ? (
                    <img src={getProfilePicUrl(user.profilePic)} alt={user.username} />
                  ) : (
                    <DefaultAvatar />
                  )}
                  <div className={`user-avatar-status-dot ${user.isOnline ? 'online' : 'offline'}`} />
                </div>
                <div className="user-item-content">
                  <div className="user-item-top">
                    <span className="user-name">{user.username}</span>
                    {lastMessages?.[user.username]?.timestamp && (
                      <span className={`user-msg-time${unreadCount > 0 ? ' unread' : ''}`}>
                        {formatMsgTime(lastMessages[user.username].timestamp)}
                      </span>
                    )}
                  </div>
                  <div className="user-item-bottom">
                    {isUserTyping ? (
                      <span className="user-typing-text">typing...</span>
                    ) : lastMessages?.[user.username] ? (
                      <span className={`user-last-message${lastMessages[user.username].deletedForAll ? ' deleted-preview' : ''}`}>
                        {lastMessages[user.username].deletedForAll ? (
                          <span className="sidebar-deleted-text">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                            </svg>
                            This message was deleted
                          </span>
                        ) : (
                          <>
                            {lastMessages[user.username].sender === currentUser.username && (() => {
                              const st = lastMessages[user.username].status;
                              const color = st === 'seen' ? '#6C63FF' : '#b5b3c7';
                              if (st === 'delivered' || st === 'seen') {
                                return <svg className="sidebar-tick" viewBox="0 0 16 15" width="16" height="15" fill={color}><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.32.32 0 0 0-.484.033l-.36.462a.365.365 0 0 0 .063.51l1.36 1.23c.143.14.361.125.484-.033l6.186-7.953a.365.365 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/></svg>;
                              }
                              return <svg className="sidebar-tick" viewBox="0 0 16 15" width="16" height="15" fill="#b5b3c7"><path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/></svg>;
                            })()}
                            {lastMessages[user.username].text}
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="user-status-text">Start a conversation</span>
                    )}
                    {unreadCount > 0 && (
                      <div className="unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-current-user">
        <div className="sidebar-current-user-avatar" onClick={() => setProfilePicModalOpen(true)} title="Change profile picture">
          {currentUser.profilePic ? (
            <img src={getProfilePicUrl(currentUser.profilePic)} alt={currentUser.username} />
          ) : (
            <DefaultAvatar />
          )}
          <div className="profile-pic-overlay">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
        </div>
        <span className="sidebar-current-user-name">{currentUser.username}</span>
        <div className="sidebar-current-user-actions">
          <button className="sidebar-action-btn" onClick={onSettingsOpen} aria-label="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button className="sidebar-action-btn" onClick={onLogout} aria-label="Logout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* Current user profile pic modal (view + edit + crop) */}
      <ProfilePicModal
        isOpen={profilePicModalOpen}
        onClose={() => setProfilePicModalOpen(false)}
        currentPicUrl={getProfilePicUrl(currentUser.profilePic)}
        onSave={handleSaveProfilePic}
        onDelete={handleDeleteProfilePic}
        username={currentUser.username}
      />

      {/* Other user profile pic view-only modal */}
      {viewingUserPic && (
        <ProfilePicModal
          isOpen={true}
          onClose={() => setViewingUserPic(null)}
          currentPicUrl={getProfilePicUrl(viewingUserPic.profilePic)}
          username={viewingUserPic.username}
          viewOnly
        />
      )}
    </div>
  );
};

export default Sidebar;
