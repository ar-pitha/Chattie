import React, { useState } from "react";
import { authAPI } from "../utils/api";
import { requestFCMToken, registerServiceWorker } from "../utils/firebase";
import { initializeSocket, emitUserJoin } from "../utils/socket";
import "../styles/Auth.css";

const Auth = ({ onAuthSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authAPI.register(username, password);
      alert("Registration successful! Please login.");
      setIsRegister(false);
      setUsername("");
      setPassword("");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // First initialize socket
      initializeSocket();
      
      // Then register and wait for Service Worker to be active
      await registerServiceWorker();
      
      // Now request FCM token (Service Worker is ready)
      const fcmToken = await requestFCMToken();
      
      // Perform login
      const response = await authAPI.login(username, password);
      const user = response.data.user;
      
      // Update FCM token if we got one
      if (fcmToken) {
        try {
          await authAPI.updateFCMToken(user._id, fcmToken);
        } catch (tokenErr) {
          console.warn('⚠️ Failed to update FCM token, but login succeeded:', tokenErr);
        }
      }
      
      // Join socket
      emitUserJoin(user.username);
      onAuthSuccess(user);
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
      console.error('❌ Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Left — branding */}
      <div className="auth-left">
        <div className="auth-brand">
          <svg
            viewBox="0 0 200 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="auth-brand-svg"
          >
            <defs>
              <linearGradient id="authBubbleGrad1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6C63FF" />
                <stop offset="100%" stopColor="#8B7CFF" />
              </linearGradient>
              <linearGradient id="authBubbleGrad2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#E8E6FF" />
                <stop offset="100%" stopColor="#F3F1FF" />
              </linearGradient>
              <filter id="authShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#6C63FF" floodOpacity="0.15" />
              </filter>
            </defs>

            <g filter="url(#authShadow)">
              <rect x="20" y="16" width="110" height="44" rx="16" fill="url(#authBubbleGrad2)" />
              <rect x="20" y="44" width="12" height="12" rx="2" fill="url(#authBubbleGrad2)" transform="rotate(45, 26, 50)" />
              <rect x="34" y="30" width="72" height="6" rx="3" fill="#C5C0F0" />
              <rect x="34" y="44" width="50" height="6" rx="3" fill="#D8D4F7" />
            </g>

            <g filter="url(#authShadow)">
              <rect x="70" y="74" width="110" height="44" rx="16" fill="url(#authBubbleGrad1)" />
              <rect x="168" y="102" width="12" height="12" rx="2" fill="url(#authBubbleGrad1)" transform="rotate(45, 174, 108)" />
              <rect x="84" y="88" width="78" height="6" rx="3" fill="rgba(255,255,255,0.5)" />
              <rect x="84" y="102" width="54" height="6" rx="3" fill="rgba(255,255,255,0.35)" />
            </g>

            <g>
              <rect x="20" y="72" width="50" height="30" rx="14" fill="url(#authBubbleGrad2)" opacity="0.7" />
              <circle className="anim-dot anim-dot-1" cx="34" cy="87" r="3.5" fill="#9B93E0" />
              <circle className="anim-dot anim-dot-2" cx="45" cy="87" r="3.5" fill="#9B93E0" />
              <circle className="anim-dot anim-dot-3" cx="56" cy="87" r="3.5" fill="#9B93E0" />
            </g>
          </svg>
          <h1>Chattie</h1>
          <p>Professional secure real-time messaging</p>
        </div>
      </div>

      {/* Right — form */}
      <div className="auth-right">
        <div className="auth-card">
          <h2 className="auth-title">
            {isRegister ? "Create Chattie" : "Welcome to Chattie"}
          </h2>
          <p className="auth-subtitle">
            {isRegister
              ? "Sign up quickly and start chatting"
              : "Sign in to continue messaging securely"}
          </p>

          <form
            onSubmit={isRegister ? handleRegister : handleLogin}
            className="auth-form"
          >
            <div className="auth-field">
              <label htmlFor="auth-user">Username</label>
              <div className="auth-input-wrap">
                <svg
                  className="auth-field-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="auth-user"
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError("");
                  }}
                  disabled={loading}
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="auth-pass">Password</label>
              <div className="auth-input-wrap">
                <svg
                  className="auth-field-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="auth-pass"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  disabled={loading}
                  required
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide" : "Show"}
                >
                  {showPassword ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="auth-error">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  width="14"
                  height="14"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={loading || !username || !password}
            >
              {loading ? (
                <span className="auth-spinner" />
              ) : isRegister ? (
                "Create Account"
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="auth-switch">
            {isRegister ? "Already have an account?" : "Don't have an account?"}
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError("");
                setPassword("");
              }}
            >
              {isRegister ? "Sign In" : "Sign Up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
