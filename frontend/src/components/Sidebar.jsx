import React, { useEffect, useState, useMemo } from 'react';
import { usersAPI } from '../utils/api';
import '../styles/Sidebar.css';

const Sidebar = ({ currentUser, selectedUser, onSelectUser, users, setUsers, unreadCounts, typingUsers, lastMessageTimes, lastMessages }) => {
  const [searchTerm, setSearchTerm] = useState('');

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

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';

  return (
    <div className="sidebar">
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
                <div className="user-avatar">
                  {getInitial(user.username)}
                  {user.isOnline && <div className="user-avatar-online-dot" />}
                </div>
                <div className="user-item-content">
                  <div className="user-item-top">
                    <span className="user-name">{user.username}</span>
                  </div>
                  <div className="user-item-bottom">
                    {isUserTyping ? (
                      <span className="user-typing-text">typing...</span>
                    ) : lastMessages?.[user.username] ? (
                      <span className="user-last-message">
                        {lastMessages[user.username].sender === currentUser.username ? 'You: ' : ''}
                        {lastMessages[user.username].text}
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
        <div className="sidebar-current-user-avatar">
          {getInitial(currentUser.username)}
          <div className="user-avatar-online-dot" />
        </div>
        <span className="sidebar-current-user-name">{currentUser.username}</span>
      </div>
    </div>
  );
};

export default Sidebar;
