import React, { useState } from 'react';
import { authAPI } from '../utils/api';
import '../styles/AppLockModal.css';

const AppLockModal = ({ username, onUnlock, isOpen }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.verifyAppLockPassword(username, password);
      setPassword('');
      onUnlock();
    } catch (err) {
      setError(err.response?.data?.message || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="al-overlay">
      <div className="al-screen">

        {/* Header */}
        <div className="al-header">
          <span className="al-header-title">Chattie</span>
        </div>

        {/* Body — doodle bg, card centered */}
        <div className="al-body">
          <div className="al-card">
            <div className="al-lock-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h2 className="al-title">App Locked</h2>
            <p className="al-subtitle">Enter your password to continue</p>

            <form onSubmit={handleVerify} className="al-form">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                disabled={loading}
                autoFocus
                required
              />
              {error && <p className="al-error">{error}</p>}
              <button type="submit" disabled={loading || !password}>
                {loading ? 'Verifying...' : 'Unlock'}
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AppLockModal;
