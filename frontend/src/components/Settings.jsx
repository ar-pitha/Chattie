import React, { useState } from 'react';
import { authAPI } from '../utils/api';
import '../styles/Settings.css';

const Settings = ({ currentUsername, isOpen, onClose, hasAppLock, onAppLockChange }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  if (!isOpen) return null;

  const handleSetAppLock = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!password || !confirmPassword) { setError('Both fields are required'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 4) { setError('Minimum 4 characters'); return; }
    setLoading(true);
    try {
      await authAPI.setAppLockPassword(currentUsername, password);
      await authAPI.toggleAppLock(currentUsername, true);
      onAppLockChange?.(true);
      setSuccess('App lock enabled');
      setTimeout(() => { setPassword(''); setConfirmPassword(''); setSuccess(''); onClose(); }, 1400);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to set app lock');
    } finally { setLoading(false); }
  };

  const handleConfirmDisable = async () => {
    if (!disablePassword) { setError('Enter your password'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await authAPI.verifyAppLockPassword(currentUsername, disablePassword);
      await authAPI.toggleAppLock(currentUsername, false);
      setSuccess('App lock disabled');
      onAppLockChange?.(false);
      setTimeout(() => { setDisablePassword(''); setShowDisableConfirm(false); setSuccess(''); onClose(); }, 1400);
    } catch (err) {
      setError(err.response?.data?.message || 'Incorrect password');
    } finally { setLoading(false); }
  };

  const handleClose = () => {
    setError(''); setSuccess('');
    setPassword(''); setConfirmPassword(''); setDisablePassword('');
    setShowDisableConfirm(false);
    onClose();
  };

  return (
    <div className="st-overlay" onClick={handleClose}>
      <div className="st-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="st-header">
          <span className="st-header-title">Settings</span>
          <button className="st-close" onClick={handleClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="st-body">
          <div className="st-center">

            <p className="st-section-label">App Lock</p>

            <div className="st-card">
              <div className="st-lock-row">
                <div className="st-lock-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div className="st-lock-info">
                  <span className="st-lock-title">App Lock</span>
                  <span className="st-lock-desc">
                    {hasAppLock ? 'Your chats are password protected' : 'Protect your chats with a password'}
                  </span>
                </div>
                <span className={`st-status-dot ${hasAppLock ? 'on' : 'off'}`} />
              </div>
            </div>

            {!hasAppLock && (
              <div className="st-card st-form-card">
                <form onSubmit={handleSetAppLock}>
                  <div className="st-field">
                    <label htmlFor="st-pw">Password</label>
                    <input id="st-pw" type="password" placeholder="Enter a password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} disabled={loading} />
                  </div>
                  <div className="st-field">
                    <label htmlFor="st-cpw">Confirm Password</label>
                    <input id="st-cpw" type="password" placeholder="Re-enter password" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(''); }} disabled={loading} />
                  </div>
                  {error   && <p className="st-error">{error}</p>}
                  {success && <p className="st-success">{success}</p>}
                  <button type="submit" className="st-btn-primary" disabled={loading}>
                    {loading ? 'Saving…' : 'Enable App Lock'}
                  </button>
                </form>
              </div>
            )}

            {hasAppLock && (
              <div className="st-card st-form-card">
                {!showDisableConfirm ? (
                  <>
                    {error   && <p className="st-error">{error}</p>}
                    {success && <p className="st-success">{success}</p>}
                    <button type="button" className="st-btn-danger" onClick={() => { setShowDisableConfirm(true); setError(''); }} disabled={loading}>
                      Disable App Lock
                    </button>
                  </>
                ) : (
                  <>
                    <div className="st-field">
                      <label htmlFor="st-dpw">Enter password to disable</label>
                      <input id="st-dpw" type="password" placeholder="Your app lock password" value={disablePassword} onChange={e => { setDisablePassword(e.target.value); setError(''); }} disabled={loading} autoFocus />
                    </div>
                    {error   && <p className="st-error">{error}</p>}
                    {success && <p className="st-success">{success}</p>}
                    <div className="st-btn-row">
                      <button type="button" className="st-btn-ghost" onClick={() => { setShowDisableConfirm(false); setDisablePassword(''); setError(''); }} disabled={loading}>Cancel</button>
                      <button type="button" className="st-btn-danger" onClick={handleConfirmDisable} disabled={loading}>{loading ? 'Verifying…' : 'Disable'}</button>
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
