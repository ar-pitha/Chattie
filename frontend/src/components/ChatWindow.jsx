import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { chatAPI, mediaAPI } from '../utils/api';
import {
  onReceiveMessage, onDeleteMessage, onDeleteMessageForMe, onTypingIndicator,
  onStopTyping, onMessageStatusUpdated, onCallUser, onAnswerCall, onIceCandidate, onEndCall, emitMessageSeen, emitMessageDelivered, emitClearUnreadCount
} from '../utils/socket';
import MessageActions from './MessageActions';
import CallScreen from './CallScreen';
import VideoCallScreen from './VideoCallScreen';
import IncomingCallPopup from './IncomingCallPopup';
import CallHistory from './CallHistory';
import MediaMessage from './MediaMessage';
import CallTypeSelector from './CallTypeSelector';
import { useWebRTCVideo } from '../hooks/useWebRTCVideo';
import '../styles/ChatWindow.css';
import '../styles/MediaMessage.css';
import '../styles/VideoCallScreen.css';
import '../styles/CallTypeSelector.css';

const URL_REGEX = /(?:https?:\/\/|www\.)[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*/gi;

function linkifyText(text) {
  if (!text) return text;
  const parts = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_REGEX.source, 'gi');
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const url = match[0];
    const href = url.startsWith('http') ? url : `https://${url}`;
    parts.push(<a key={match.index} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{url}</a>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

function formatDateSeparator(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const SingleTick = () => (
  <svg viewBox="0 0 16 15" width="16" height="15" fill="currentColor">
    <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/>
  </svg>
);

const DoubleTick = () => (
  <svg viewBox="0 0 16 15" width="16" height="15" fill="currentColor">
    <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.32.32 0 0 0-.484.033l-.36.462a.365.365 0 0 0 .063.51l1.36 1.23c.143.14.361.125.484-.033l6.186-7.953a.365.365 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/>
  </svg>
);

const ChatWindow = ({ currentUser, selectedUser, messages, setMessages, onReply, unreadCounts, onClearUnread, onBack, scrollTrigger, onMessageDeletedForAll }) => {
  const [loading, setLoading] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showCallTypeSelector, setShowCallTypeSelector] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const {
    callStatus, incomingCall, incomingCaller, remoteAudioRef, remoteVideoRef, localVideoRef,
    startCall, acceptCall, rejectCall, endCall, handleRemoteEndCall,
    handleOffer, handleAnswer, handleIceCandidate, cleanup,
    callDuration, isMuted, speakerEnabled, networkQuality, networkWarning,
    toggleMute, toggleSpeaker, toggleVideo, isVideoEnabled, callType
  } = useWebRTCVideo(currentUser.username, selectedUser?.username);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    setShowScrollBtn(container.scrollHeight - container.scrollTop - container.clientHeight > 100);
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollToReplyOriginal = useCallback((replyToMessageId) => {
    if (!replyToMessageId) return;
    const el = messagesContainerRef.current?.querySelector(`[data-msgid="${replyToMessageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(replyToMessageId);
      setTimeout(() => setHighlightedMessageId(null), 1500);
    }
  }, []);

  // Scroll to bottom when media menu opens
  useEffect(() => {
    if (scrollTrigger) scrollToBottom();
  }, [scrollTrigger, scrollToBottom]);


  useEffect(() => {
    const unsubscribe = onMessageStatusUpdated((data) => {
      if (data.sender === currentUser.username) {
        setMessages((prev) => prev.map((msg) =>
          String(msg._id) === String(data.messageId) ? { ...msg, status: data.status } : msg
        ));
      }
    });
    return unsubscribe;
  }, [currentUser.username]);

  useEffect(() => {
    setIsTyping(false);
    if (selectedUser) {
      fetchMessages();
      onClearUnread?.(selectedUser.username);
    }
  }, [selectedUser?.username, currentUser.username, currentUser._id]);

  useEffect(() => {
    console.log(`🎧 [ChatWindow] Setting up receive_message listener for ${selectedUser?.username}`);
    const unsubscribe = onReceiveMessage((message) => {
      console.log(`💬 ChatWindow received message:`, {
        from: message.sender,
        to: message.receiver,
        text: message.text,
        selectedUserUsername: selectedUser?.username,
        currentUserUsername: currentUser.username
      });
      
      const isForConvo = selectedUser &&
        ((message.sender === currentUser.username && message.receiver === selectedUser.username) ||
         (message.sender === selectedUser.username && message.receiver === currentUser.username));

      console.log(`📍 Is message for current conversation? ${isForConvo}`);

      if (isForConvo) {
        console.log(`✅ Adding message to current conversation`);
        emitMessageDelivered(message._id, currentUser.username, message.sender);
        emitMessageSeen(message._id, currentUser.username, message.sender);
        // Backend increments unread in saveMessage, but we're viewing this chat,
        // so immediately clear it
        emitClearUnreadCount(currentUser.username, message.sender);
        onClearUnread?.(message.sender);
        setMessages((prev) => {
          const dup = prev.some(m => m.sender === message.sender && m.receiver === message.receiver && m.text === message.text && Math.abs(new Date(m.timestamp) - new Date(message.timestamp)) < 2000);
          if (dup) {
            console.log(`⚠️ Duplicate message detected, skipping`);
            return prev;
          }
          console.log(`🆕 Adding new message to state`);
          return [...prev, message];
        });
      } else if (message.receiver === currentUser.username) {
        // Message is for me but I'm on a different chat (or home screen)
        emitMessageDelivered(message._id, currentUser.username, message.sender);
        // Backend handles unread count: saveMessage increments in DB and
        // emits 'unread-count-updated' with the absolute count via socket.
        // No local increment here — avoids double-counting.
      }
    });
    return () => {
      console.log(`🎧 [ChatWindow] Unsubscribing from receive_message listener for ${selectedUser?.username}`);
      unsubscribe();
    };
  }, [selectedUser?.username, currentUser.username]);

  useEffect(() => { return onDeleteMessage((d) => setMessages((p) => p.map((m) => m._id === d.messageId ? { ...m, text: 'This message was deleted', deletedForAll: true, media: null, replyTo: null } : m))); }, [setMessages]);
  useEffect(() => { return onDeleteMessageForMe((d) => setMessages((p) => p.filter((m) => !(m._id === d.messageId && d.username !== currentUser.username)))); }, [setMessages, currentUser.username]);
  const typingTimeoutRef = useRef(null);
  useEffect(() => {
    const unsub = onTypingIndicator((d) => {
      if (d.username === selectedUser?.username && d.receiver === currentUser.username) {
        setIsTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
      }
    });
    return () => { unsub(); if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, [selectedUser, currentUser.username]);
  useEffect(() => {
    return onStopTyping((d) => {
      if (d.username === selectedUser?.username && d.receiver === currentUser.username) {
        setIsTyping(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      }
    });
  }, [selectedUser, currentUser.username]);
  useEffect(() => { return onCallUser((d) => handleOffer(d.offer, d.from, d.callType || 'audio')); }, [handleOffer]);
  useEffect(() => { return onAnswerCall((d) => handleAnswer(d.answer)); }, [handleAnswer]);
  useEffect(() => { return onIceCandidate((d) => handleIceCandidate(d.candidate)); }, [handleIceCandidate]);
  useEffect(() => { return onEndCall(() => handleRemoteEndCall()); }, [handleRemoteEndCall]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const response = await chatAPI.getMessages(currentUser.username, selectedUser.username);
      
      // Debug log to check media field structure
      const messagesWithMedia = response.data.filter(m => m.media && m.media.fileId);
      const messagesWithoutMedia = response.data.filter(m => !m.media || !m.media.fileId);
      
      console.log(`📊 Messages fetched - Total: ${response.data.length}, With Media: ${messagesWithMedia.length}, Without: ${messagesWithoutMedia.length}`);
      
      if (messagesWithMedia.length > 0) {
        console.log('✅ Sample media message:', messagesWithMedia[0]);
      }
      if (messagesWithoutMedia.length > 0 && response.data[0]) {
        console.log('📝 Sample text message:', messagesWithoutMedia[0]);
      }
      
      setMessages(response.data);

      // Mark unseen messages from the other user as 'seen' via socket
      // This notifies the sender in real-time so their ticks update
      const unseenFromOther = response.data.filter(
        (msg) => msg.sender === selectedUser.username && msg.status !== 'seen'
      );
      unseenFromOther.forEach((msg) => {
        emitMessageSeen(msg._id, currentUser.username, msg.sender);
      });

      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMessage = (messageId, forMeOnly = false) => {
    if (forMeOnly) {
      // Delete for me — remove from view completely
      setMessages((p) => p.filter((m) => m._id !== messageId));
    } else {
      // Delete for all — show "message deleted" placeholder
      setMessages((p) => p.map((m) => m._id === messageId ? { ...m, text: 'This message was deleted', deletedForAll: true, media: null, replyTo: null } : m));
      onMessageDeletedForAll?.(selectedUser?.username);
    }
  };

  const handleReplyClick = (message) => {
    onReply?.({ id: message._id, text: message.text, sender: message.sender });
  };

  const handleStartCall = () => {
    if (selectedUser.isOnline) setShowCallTypeSelector(true);
    else alert(`${selectedUser.username} is offline`);
  };

  const handleSelectAudioCall = () => {
    setShowCallTypeSelector(false);
    startCall('audio');
  };

  const handleSelectVideoCall = () => {
    setShowCallTypeSelector(false);
    startCall('video');
  };

  const groupedMessages = useMemo(() => {
    const groups = [];
    let lastDate = '';
    messages.forEach((msg) => {
      const msgDate = new Date(msg.timestamp).toDateString();
      if (msgDate !== lastDate) {
        groups.push({ type: 'date', date: msg.timestamp, key: `date-${msgDate}` });
        lastDate = msgDate;
      }
      groups.push({ type: 'message', data: msg, key: msg._id || `msg-${groups.length}` });
    });
    return groups;
  }, [messages]);

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : '?';

  if (!selectedUser) {
    return (
      <div className="chat-window empty">
        <div className="empty-state">
          <div className="empty-state-icon-wrap">
            <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="90" height="90">
              <circle cx="40" cy="40" r="38" stroke="#6C63FF" strokeWidth="1.5" strokeOpacity="0.15"/>
              <path d="M40 18C27.85 18 18 26.954 18 38c0 5.292 2.274 10.09 5.985 13.593L22 58l7.08-2.268A23.813 23.813 0 0 0 40 58c12.15 0 22-8.954 22-20S52.15 18 40 18z" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="32" cy="38" r="2" fill="#6C63FF"/>
              <circle cx="40" cy="38" r="2" fill="#6C63FF"/>
              <circle cx="48" cy="38" r="2" fill="#6C63FF"/>
            </svg>
          </div>
          <h2 className="empty-state-title">Chattie</h2>
          <p className="empty-state-subtitle">Send and receive messages instantly</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      {callType === 'video' && callStatus && <VideoCallScreen callStatus={callStatus} remoteUser={selectedUser.username} onEndCall={endCall} remoteAudioRef={remoteAudioRef} remoteVideoRef={remoteVideoRef} localVideoRef={localVideoRef} isMuted={isMuted} callDuration={callDuration} networkQuality={networkQuality} networkWarning={networkWarning} onToggleMute={toggleMute} onToggleSpeaker={toggleSpeaker} onToggleVideo={toggleVideo} isVideoEnabled={isVideoEnabled} speakerEnabled={speakerEnabled} />}
      {callType === 'audio' && callStatus && <CallScreen callStatus={callStatus} remoteUser={selectedUser.username} onEndCall={endCall} remoteAudioRef={remoteAudioRef} isMuted={isMuted} callDuration={callDuration} networkQuality={networkQuality} networkWarning={networkWarning} onToggleMute={toggleMute} onToggleSpeaker={toggleSpeaker} speakerEnabled={speakerEnabled} />}
      {incomingCall && <IncomingCallPopup caller={incomingCaller} onAccept={acceptCall} onReject={rejectCall} callType={callType} />}
      {showCallTypeSelector && <CallTypeSelector recipientName={selectedUser.username} onSelectAudio={handleSelectAudioCall} onSelectVideo={handleSelectVideoCall} onCancel={() => setShowCallTypeSelector(false)} />}

      {/* Chat header with back arrow */}
      <div className="chat-header">
        <div className="header-user">
          {onBack && (
            <button className="back-btn" onClick={onBack} aria-label="Back to chats">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          <div className="chat-header-avatar">
            {selectedUser.profilePic ? (
              <img src={mediaAPI.getProfilePicUrl(selectedUser.profilePic)} alt={selectedUser.username} />
            ) : (
              <svg viewBox="0 0 212 212" width="100%" height="100%">
                <path fill="rgba(255,255,255,0.3)" d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0z"/>
                <path fill="#fff" d="M106 45c20.4 0 37 16.6 37 37s-16.6 37-37 37-37-16.6-37-37 16.6-37 37-37zm0 100c33.1 0 60 14.3 60 32v8H46v-8c0-17.7 26.9-32 60-32z"/>
              </svg>
            )}
          </div>
          <div className="header-info">
            <h2>{selectedUser.username}</h2>
            {isTyping ? (
              <div className="typing-indicator">
                <span className="typing-indicator-text">typing</span>
                <div className="typing-dots-header"><span></span><span></span><span></span></div>
              </div>
            ) : selectedUser.isOnline ? (
              <div className="header-status online">online</div>
            ) : null}
          </div>
        </div>
        <div className="header-actions">
          <button className="chat-header-btn" onClick={handleStartCall} disabled={!selectedUser.isOnline || callStatus} aria-label="Voice call">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </button>
          <button className={`chat-header-btn ${showCallHistory ? 'active' : ''}`} onClick={() => setShowCallHistory(!showCallHistory)} aria-label="Call history">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="chat-content-wrapper">
        <div className="messages-container" ref={messagesContainerRef}>
          {loading ? (
            <div className="loading-skeleton">
              <div className="skeleton-date" />
              <div className="skeleton-msg received" />
              <div className="skeleton-msg sent short" />
              <div className="skeleton-msg received long" />
              <div className="skeleton-msg sent" />
              <div className="skeleton-msg received short" />
              <div className="skeleton-msg sent long" />
              <div className="skeleton-msg received" />
            </div>
          ) : messages.length === 0 ? (
            <div className="no-messages">No messages yet. Say hello!</div>
          ) : (
            <>
              {groupedMessages.map((item) => {
                if (item.type === 'date') {
                  return (
                    <div key={item.key} className="date-separator">
                      <span className="date-separator-label">{formatDateSeparator(item.date)}</span>
                    </div>
                  );
                }
                const msg = item.data;
                const isSent = msg.sender === currentUser.username;
                
                // Debug logging
                if (msg.media) {
                  console.log('✅ Message HAS media field:', {
                    id: msg._id,
                    mediaType: msg.media.mediaType,
                    fileName: msg.media.fileName,
                    fileId: msg.media.fileId
                  });
                } else if (msg.text && msg.text.includes('📎')) {
                  console.warn('⚠️ Message text has attachment emoji but no media field:', msg.text, msg);
                }
                
                return (
                  <div key={item.key} data-msgid={msg._id} className={`message ${isSent ? 'sent' : 'received'} ${msg.deletedForAll ? 'deleted' : ''} ${highlightedMessageId === msg._id ? 'highlighted' : ''}`} onClick={() => !msg.deletedForAll && setActiveMessageId(activeMessageId === msg._id ? null : msg._id)}>
                    {msg.media && msg.media.fileId && !msg.deletedForAll ? (
                      <>
                        <MediaMessage message={msg} isOwn={isSent} />
                        <div className="message-footer" style={{ paddingLeft: '12px', marginTop: '4px' }}>
                          <span className="message-time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isSent && (
                            <span className={`tick-icon ${msg.status}`}>
                              {msg.status === 'sent' && <SingleTick />}
                              {(msg.status === 'delivered' || msg.status === 'seen') && <DoubleTick />}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="message-bubble">
                        {msg.replyTo && !msg.deletedForAll && (
                          <div className="message-reply-quote" onClick={(e) => { e.stopPropagation(); scrollToReplyOriginal(msg.replyTo.messageId); }}>
                            <div className="reply-quote-sender">{msg.replyTo.sender}</div>
                            <div className="reply-quote-text">{msg.replyTo.text}</div>
                          </div>
                        )}
                        <div className="message-text">
                          {msg.deletedForAll ? (
                            <span className="deleted-msg-text">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                                <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                              </svg>
                              This message was deleted
                            </span>
                          ) : linkifyText(msg.text)}
                        </div>
                        <div className="message-footer">
                          <span className="message-time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isSent && (
                            <span className={`tick-icon ${msg.status}`}>
                              {msg.status === 'sent' && <SingleTick />}
                              {(msg.status === 'delivered' || msg.status === 'seen') && <DoubleTick />}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {activeMessageId === msg._id && !msg.deletedForAll && (
                      <MessageActions messageId={msg._id} message={msg} currentUsername={currentUser.username} isOwnMessage={isSent} onDelete={handleDeleteMessage} onReply={handleReplyClick} onClose={() => setActiveMessageId(null)} />
                    )}
                  </div>
                );
              })}
              {isTyping && (
                <div className="typing-bubble">
                  <div className="typing-dots"><span></span><span></span><span></span></div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {showScrollBtn && (
          <button className="scroll-to-bottom" onClick={scrollToBottom} aria-label="Scroll to bottom">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        )}

        {showCallHistory && <CallHistory currentUser={currentUser} selectedUser={selectedUser} />}
      </div>
    </div>
  );
};

export default ChatWindow;
