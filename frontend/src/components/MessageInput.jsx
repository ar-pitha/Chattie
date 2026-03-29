import React, { useState, useRef, useEffect } from 'react';
import { chatAPI, notificationAPI } from '../utils/api';
import { emitTyping, emitStopTyping } from '../utils/socket';
import ReplyPreview from './ReplyPreview';
import '../styles/MessageInput.css';

const MessageInput = ({ currentUser, selectedUser, onMessageSent, replyingTo, onReplyCancel }) => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = React.useRef(null);
  const inputRef = useRef(null);

  // Auto-focus input when chat opens or selected user changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedUser?.username]);

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      emitTyping(currentUser.username, selectedUser.username);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
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
    const replyData = replyingTo ? {
      messageId: replyingTo.id,
      text: replyingTo.text,
      sender: replyingTo.sender
    } : null;

    setText('');
    setIsTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitStopTyping(currentUser.username, selectedUser.username);
    onReplyCancel?.();

    try {
      const saveResponse = await chatAPI.saveMessage(currentUser.username, selectedUser.username, messageText, replyData);
      const savedMessage = saveResponse.data?.data;

      // 1. Add message to state FIRST (so status updates can find it)
      const messageForState = savedMessage || {
        sender: currentUser.username,
        receiver: selectedUser.username,
        text: messageText,
        replyTo: replyData,
        timestamp: new Date(),
        status: 'sent'
      };
      onMessageSent?.(messageForState);

      // 2. Send push notification (fire-and-forget, don't block)
      notificationAPI.sendNotificationByUsername(
        selectedUser.username,
        currentUser.username,
        messageText
      ).catch(() => {});

    } catch (error) {
      console.error('Error sending message:', error);
      setText(messageText);
    } finally {
      setLoading(false);
      // Delay focus so React re-enables the input first
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div className="message-input-wrapper">
      {replyingTo && (
        <ReplyPreview replyTo={replyingTo} onCancel={onReplyCancel} />
      )}
      <form className="message-input" onSubmit={handleSendMessage}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a message"
          value={text}
          onChange={(e) => { setText(e.target.value); handleTyping(); }}
          disabled={loading}
          autoComplete="off"
        />
        <button type="submit" className="send-btn" disabled={loading || !text.trim()} aria-label="Send message">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </form>
    </div>
  );
};

export default MessageInput;
