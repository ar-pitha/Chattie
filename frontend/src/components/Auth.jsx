import React, { useState } from 'react';
import { authAPI } from '../utils/api';
import { requestFCMToken, registerServiceWorker } from '../utils/firebase';
import { initializeSocket, emitUserJoin } from '../utils/socket';
import '../styles/Auth.css';

const Auth = ({ onAuthSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.register(username, password);
      alert('Registration successful! Please login.');
      setIsRegister(false);
      setUsername('');
      setPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Initialize Socket.IO
      initializeSocket();

      // Register Service Worker
      await registerServiceWorker();

      // Request FCM token
      const fcmToken = await requestFCMToken();

      // Login
      const response = await authAPI.login(username, password);
      const user = response.data.user;

      // Update FCM token in backend
      if (fcmToken) {
        await authAPI.updateFCMToken(user._id, fcmToken);
      }

      // Emit user join event
      emitUserJoin(user.username);

      // Call success callback
      onAuthSuccess(user);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>Chat Application</h1>
        <div className="auth-toggle">
          <button
            className={!isRegister ? 'active' : ''}
            onClick={() => {
              setIsRegister(false);
              setError('');
            }}
          >
            Login
          </button>
          <button
            className={isRegister ? 'active' : ''}
            onClick={() => {
              setIsRegister(true);
              setError('');
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={isRegister ? handleRegister : handleLogin}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Loading...' : isRegister ? 'Register' : 'Login'}
          </button>
        </form>

        {error && <div className="error-message">{error}</div>}
      </div>
    </div>
  );
};

export default Auth;
