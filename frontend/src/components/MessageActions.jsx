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
  onEdit,
  onStar,
  onPin,
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

  const handleEdit = () => {
    onEdit?.(message);
    onClose();
  };

  const handleStar = async () => {
    setLoading(true);
    try {
      await chatAPI.toggleStar(messageId, currentUsername);
      onStar?.(messageId, currentUsername);
    } catch (err) {
      setError('Failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePin = async () => {
    setLoading(true);
    try {
      await chatAPI.togglePin(messageId, currentUsername);
      onPin?.(messageId, !isPinned);
    } catch (err) {
      setError('Failed');
    } finally {
      setLoading(false);
    }
  };

  // Check if edit is allowed (own message, within 24 hours, text-only)
  const canEdit = isOwnMessage && !message.media && !message.callEvent &&
    ((Date.now() - new Date(message.timestamp).getTime()) / (1000 * 60 * 60)) <= 24;

  const isStarred = message.starredBy?.includes(currentUsername);
  const isPinned = message.pinned;

  // Compact inline icon bar — identical on desktop and mobile
  return (
    <div className="message-actions" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
      <button className="action-btn reply-btn" onClick={handleReply} disabled={loading} title="Reply">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 17 4 12 9 7"/>
          <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
        </svg>
      </button>

      {canEdit && (
        <button className="action-btn edit-btn" onClick={handleEdit} disabled={loading} title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      )}

      <button className={`action-btn star-btn ${isStarred ? 'active' : ''}`} onClick={handleStar} disabled={loading} title={isStarred ? 'Unstar' : 'Star'}>
        <svg viewBox="0 0 24 24" fill={isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </button>

      <button className={`action-btn pin-btn ${isPinned ? 'active' : ''}`} onClick={handlePin} disabled={loading} title={isPinned ? 'Unpin' : 'Pin'}>
        <svg viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="17" x2="12" y2="22"/>
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/>
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
