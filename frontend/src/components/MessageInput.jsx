import React, { useState, useRef, useEffect } from 'react';
import { chatAPI, notificationAPI, mediaAPI } from '../utils/api';
import { emitTyping, emitStopTyping } from '../utils/socket';
import ReplyPreview from './ReplyPreview';
import MediaActions, { MediaPopup } from './MediaActions';
import '../styles/MessageInput.css';

const MessageInput = ({ currentUser, selectedUser, onMessageSent, replyingTo, onReplyCancel, editingMessage, onEditCancel, onEditDone, onMediaMenuToggle }) => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const typingTimeoutRef = React.useRef(null);
  const inputRef = useRef(null);
  const isSendingRef = useRef(false);
  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const docRef = useRef(null);

  // Auto-focus input when chat opens or selected user changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedUser?.username]);

  // Focus input when replying to a message
  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  // Edit mode — populate text and focus
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [editingMessage]);

  // Auto-grow textarea only when text wraps past the first line
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '44px'; // reset to one line
    const scroll = el.scrollHeight;
    if (scroll > 44) {
      const h = Math.min(scroll, 120);
      el.style.height = h + 'px';
      el.style.overflowY = h >= 120 ? 'auto' : 'hidden';
    } else {
      el.style.overflowY = 'hidden';
    }
  }, [text]);

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

    // Edit mode — update existing message
    if (editingMessage) {
      setLoading(true);
      try {
        await chatAPI.editMessage(editingMessage.id, text.trim(), currentUser.username);
        onEditDone?.(editingMessage.id, text.trim());
        setText('');
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to edit message');
      } finally {
        setLoading(false);
      }
      return;
    }

    console.log(`
📤 Sending message:`, {
      from: currentUser.username,
      to: selectedUser.username,
      text: text.trim()
    });

    setLoading(true);
    const messageText = text.trim();
    const replyData = replyingTo ? {
      messageId: replyingTo.id,
      text: replyingTo.text,
      sender: replyingTo.sender
    } : null;

    // Prevent keyboard from closing during send
    isSendingRef.current = true;
    // Clear textarea value via DOM first to avoid re-render losing focus
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.style.height = '44px';
    }
    setText('');
    setIsTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    emitStopTyping(currentUser.username, selectedUser.username);
    onReplyCancel?.();

    try {
      const saveResponse = await chatAPI.saveMessage(currentUser.username, selectedUser.username, messageText, replyData);
      const savedMessage = saveResponse.data?.data;

      console.log(`✅ Message sent, backend response:`, {
        savedMessage,
        hasId: !!savedMessage?._id
      });

      const messageForState = savedMessage || {
        sender: currentUser.username,
        receiver: selectedUser.username,
        text: messageText,
        replyTo: replyData,
        timestamp: new Date(),
        status: 'sent'
      };
      onMessageSent?.(messageForState);

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
      isSendingRef.current = false;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  };

  const handleMediaUpload = async (file, mediaType) => {
    if (!file) return;

    // Validate file size
    const maxSizes = { photo: 5, video: 50, document: 20 };
    const maxSizeMB = maxSizes[mediaType];
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`File too large! Maximum size for ${mediaType}s is ${maxSizeMB}MB`);
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    try {
      const caption = text.trim() || `📎 ${file.name}`;
      const response = await mediaAPI.uploadMedia(
        file,
        currentUser.username,
        selectedUser.username,
        mediaType,
        caption
      );

      const savedMedia = response.data?.data;
      if (savedMedia) {
        onMessageSent?.(savedMedia);
        setText('');
      }

      // Send notification with media indicator
      const mediaEmoji = {
        photo: '📸',
        video: '🎥',
        document: '📄'
      };
      notificationAPI.sendNotificationByUsername(
        selectedUser.username,
        currentUser.username,
        `${mediaEmoji[mediaType]} Sent you a ${mediaType}`
      ).catch(() => {});

      setUploadProgress(null);
    } catch (error) {
      console.error('Media upload error:', error);
      alert(`Failed to upload ${mediaType}: ${error.response?.data?.message || error.message}`);
      setUploadProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const handleMenuToggle = (open) => {
    setMediaMenuOpen(open);
    onMediaMenuToggle?.(open);
  };

  return (
    <div className="message-input-wrapper">
      {editingMessage && (
        <div className="edit-preview">
          <div className="edit-preview-content">
            <span className="edit-preview-label">Editing</span>
            <span className="edit-preview-text">{editingMessage.text}</span>
          </div>
          <button className="edit-preview-cancel" onClick={() => { onEditCancel?.(); setText(''); }} aria-label="Cancel edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
      {replyingTo && !editingMessage && (
        <ReplyPreview replyTo={replyingTo} onCancel={onReplyCancel} />
      )}
      <MediaPopup
        show={mediaMenuOpen}
        onPhotoClick={() => photoRef.current?.click()}
        onVideoClick={() => videoRef.current?.click()}
        onDocumentClick={() => docRef.current?.click()}
        isLoading={loading}
      />
      {uploadProgress !== null && (
        <div className="upload-progress">
          <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
          <span>{uploadProgress}%</span>
        </div>
      )}
      <form className="message-input" onSubmit={handleSendMessage}>
        <div className="input-container">
          <MediaActions
            onPhotoSelect={(file) => handleMediaUpload(file, 'photo')}
            onVideoSelect={(file) => handleMediaUpload(file, 'video')}
            onDocumentSelect={(file) => handleMediaUpload(file, 'document')}
            isLoading={loading}
            onMenuToggle={handleMenuToggle}
          />
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Type a message"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              handleTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) handleSendMessage(e);
              }
            }}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  e.preventDefault();
                  const file = item.getAsFile();
                  if (file) handleMediaUpload(file, 'photo');
                  return;
                }
              }
            }}
            autoComplete="off"
            inputMode="text"
            onBlur={(e) => {
              // Prevent keyboard from closing when sending or tapping send button
              if (isSendingRef.current || e.relatedTarget?.closest('.send-btn')) {
                e.preventDefault();
                inputRef.current?.focus();
              }
            }}
          />
        </div>
        <button type="submit" className="send-btn" disabled={loading || !text.trim()} aria-label="Send message" onMouseDown={(e) => e.preventDefault()} onTouchStart={(e) => { e.preventDefault(); inputRef.current?.focus(); if (text.trim()) handleSendMessage(e); }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="#6C63FF"/>
          </svg>
        </button>
      </form>
      {/* Hidden file inputs triggered by MediaPopup */}
      <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => { if (e.target.files?.[0]) { handleMediaUpload(e.target.files[0], 'photo'); setMediaMenuOpen(false); } e.target.value = ''; }} style={{ display: 'none' }} />
      <input ref={videoRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-msvideo" onChange={(e) => { if (e.target.files?.[0]) { handleMediaUpload(e.target.files[0], 'video'); setMediaMenuOpen(false); } e.target.value = ''; }} style={{ display: 'none' }} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => { if (e.target.files?.[0]) { handleMediaUpload(e.target.files[0], 'document'); setMediaMenuOpen(false); } e.target.value = ''; }} style={{ display: 'none' }} />
    </div>
  );
};

export default MessageInput;
