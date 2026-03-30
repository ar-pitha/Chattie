import React, { useState } from 'react';
import { chatAPI } from '../utils/api';
import { emitDeleteMessage, emitDeleteMessageForMe } from '../utils/socket';
import '../styles/MessageActions.css';

const MessageActions = ({
  messageId,
  message,
  currentUsername,
  isOwnMessage,
  onDelete,
  onReply,
  onClose
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setLoading(true);
    setError('');
    try {
      await chatAPI.deleteMessage(messageId);
      emitDeleteMessage(messageId, message.sender, message.receiver);
      onDelete(messageId);
      onClose();
    } catch (err) {
      setError('Failed to delete');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteForMe = async () => {
    setLoading(true);
    setError('');
    try {
      await chatAPI.deleteMessageForMe(messageId, currentUsername);
      emitDeleteMessageForMe(messageId, currentUsername);
      onDelete(messageId, true);
      onClose();
    } catch (err) {
      setError('Failed to delete');
    } finally {
      setLoading(false);
    }
  };

  const handleReply = () => {
    onReply(message);
    onClose();
  };

  return (
    <div className="message-actions" onClick={(e) => e.stopPropagation()}>
      <button className="action-btn reply-btn" onClick={handleReply} disabled={loading} title="Reply">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 17 4 12 9 7"/>
          <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
        </svg>
      </button>

      <button className="action-btn delete-for-me-btn" onClick={handleDeleteForMe} disabled={loading} title="Delete for me">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>

      {isOwnMessage && (
        <button className="action-btn delete-all-btn" onClick={handleDelete} disabled={loading} title="Delete for all">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>
      )}

      {error && <div className="action-error">{error}</div>}
    </div>
  );
};

export default MessageActions;
