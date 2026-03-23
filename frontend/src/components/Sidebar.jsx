import React, { useEffect, useState } from 'react';
import { usersAPI } from '../utils/api';
import { emitUserJoin } from '../utils/socket';
import '../styles/Sidebar.css';

const Sidebar = ({ currentUser, selectedUser, onSelectUser, users, setUsers }) => {
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

  const filteredUsers = users.filter((user) =>
    user && user.username && user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Users</h2>
        <div className="current-user-info">
          <span className="current-user-name">{currentUser.username}</span>
          <div className="user-status online"></div>
        </div>
      </div>

      <input
        type="text"
        className="search-box"
        placeholder="Search users..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="users-list">
        {filteredUsers.map((user) => (
          <div
            key={user._id}
            className={`user-item ${selectedUser?._id === user._id ? 'active' : ''}`}
            onClick={() => onSelectUser(user)}
          >
            <div className="user-info">
              <span className="user-name">{user.username}</span>
              <div className={`user-status ${user.isOnline ? 'online' : 'offline'}`}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
