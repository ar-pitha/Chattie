import React, { useState, useEffect } from 'react';
import { chatAPI, notificationAPI } from '../utils/api';
import { emitSendMessage, emitTyping, emitStopTyping } from '../utils/socket';
import '../styles/MessageInput.css';

const MessageInput = ({ currentUser, selectedUser, onMessageSent }) => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = React.useRef(null);

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      emitTyping(currentUser.username, selectedUser.username);
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      emitStopTyping(currentUser.username, selectedUser.username);
    }, 2000);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!text.trim()) return;

    setLoading(true);
    const messageText = text.trim();
    setText('');
    setIsTyping(false);

    try {
      // Save message to database
      await chatAPI.saveMessage(currentUser.username, selectedUser.username, messageText);

      // Emit via Socket.IO for real-time delivery
      emitSendMessage(currentUser.username, selectedUser.username, messageText);

      // Send push notification
      try {
        await notificationAPI.sendNotificationByUsername(
          selectedUser.username,
          currentUser.username,
          messageText
        );
      } catch (notifError) {
        console.warn('Notification failed (but message was sent):', notifError.message);
      }

      // Callback to update UI
      if (onMessageSent) {
        onMessageSent({
          sender: currentUser.username,
          receiver: selectedUser.username,
          text: messageText,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setText(messageText); // Restore text on error
      alert('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="message-input" onSubmit={handleSendMessage}>
      <input
        type="text"
        placeholder="Type a message..."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          handleTyping();
        }}
        disabled={loading}
      />
      <button type="submit" disabled={loading || !text.trim()}>
        {loading ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
};

export default MessageInput;
