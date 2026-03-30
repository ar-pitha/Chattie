import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import ChatPage from './pages/ChatPage';
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (error) {
        localStorage.removeItem('currentUser');
      }
    }
    setLoading(false);
  }, []);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    localStorage.setItem('currentUser', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
  };

  if (loading) return null;

  return (
    <div className="app">
      {currentUser ? (
        <ChatPage currentUser={currentUser} onLogout={handleLogout} onCurrentUserUpdate={(user) => { setCurrentUser(user); localStorage.setItem('currentUser', JSON.stringify(user)); }} />
      ) : (
        <Auth onAuthSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}

export default App;
