import React, { useEffect, useState, useRef } from 'react';
import { chatAPI } from '../utils/api';
import { onReceiveMessage, onDeleteMessage, onDeleteMessageForMe, onTypingIndicator, onStopTyping } from '../utils/socket';
import MessageActions from './MessageActions';
import '../styles/ChatWindow.css';

const ChatWindow = ({ currentUser, selectedUser, messages, setMessages, onReply }) => {
  const [loading, setLoading] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [onCall, setOnCall] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages();
    }
  }, [selectedUser]);

  useEffect(() => {
    // Subscribe to incoming messages
    const unsubscribe = onReceiveMessage((message) => {
      console.log('📨 Message received from Socket:', message);
      
      // Update messages if this message is for the current conversation
      // Check both directions: sender→receiver and receiver→sender
      const isForCurrentConversation = 
        (message.sender === currentUser.username && message.receiver === selectedUser.username) ||
        (message.sender === selectedUser.username && message.receiver === currentUser.username);
      
      if (isForCurrentConversation) {
        console.log('✅ Adding message to conversation');
        setMessages((prev) => {
          // Check if message already exists (to avoid duplicates from onMessageSent)
          const isDuplicate = prev.some(
            (m) => m.sender === message.sender && 
                   m.receiver === message.receiver &&
                   m.text === message.text && 
                   Math.abs(new Date(m.timestamp) - new Date(message.timestamp)) < 2000
          );
          
          if (isDuplicate) {
            console.log('⚠️ Duplicate message ignored - already added via callback');
            return prev;
          }
          
          return [...prev, message];
        });
      } else {
        console.log('❌ Message not for current conversation', {
          messageSender: message.sender,
          messageReceiver: message.receiver,
          currentUser: currentUser.username,
          selectedUser: selectedUser.username
        });
      }
    });

    return unsubscribe;
  }, [selectedUser, currentUser.username, setMessages]);

  useEffect(() => {
    // Subscribe to message deletion events (for everyone)
    const unsubscribe = onDeleteMessage((data) => {
      console.log('🗑️ Message deleted:', data.messageId);
      setMessages((prev) => prev.filter((msg) => msg._id !== data.messageId));
    });

    return unsubscribe;
  }, [setMessages]);

  useEffect(() => {
    // Subscribe to message deletion for me only
    const unsubscribe = onDeleteMessageForMe((data) => {
      console.log('🗑️ Message deleted for me:', data.messageId);
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === data.messageId && data.username !== currentUser.username
            ? { ...msg, text: '[Deleted message]', deletedForMe: true }
            : msg
        )
      );
    });

    return unsubscribe;
  }, [setMessages, currentUser.username]);

  useEffect(() => {
    // Subscribe to typing indicator
    const unsubscribe = onTypingIndicator((data) => {
      if (data.username === selectedUser?.username && data.receiver === currentUser.username) {
        setIsTyping(true);
      }
    });

    return unsubscribe;
  }, [selectedUser, currentUser.username]);

  useEffect(() => {
    // Subscribe to stop typing
    const unsubscribe = onStopTyping((data) => {
      if (data.username === selectedUser?.username && data.receiver === currentUser.username) {
        setIsTyping(false);
      }
    });

    return unsubscribe;
  }, [selectedUser, currentUser.username]);

  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const response = await chatAPI.getMessages(currentUser.username, selectedUser.username);
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMessage = (messageId, forMeOnly = false) => {
    if (forMeOnly) {
      // For "delete for me", show as deleted but keep in array
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId ? { ...msg, text: '[Deleted message]', deletedForMe: true } : msg
        )
      );
    } else {
      // For "delete for everyone", remove completely
      setMessages((prev) => prev.filter((msg) => msg._id !== messageId));
    }
  };

  const handleReplyClick = (message) => {
    if (onReply) {
      onReply({
        id: message._id,
        text: message.text,
        sender: message.sender
      });
    }
  };

  const handleStartCall = () => {
    setOnCall(true);
    alert(`📞 Calling ${selectedUser.username}...\n\nNote: Voice/Video calling is coming soon!`);
  };

  const handleEndCall = () => {
    setOnCall(false);
  };

  if (!selectedUser) {
    return (
      <div className="chat-window empty">
        <div className="empty-state">
          <h2>Select a user to start chatting</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="header-info">
          <h2>{selectedUser.username}</h2>
          {isTyping ? (
            <div className="typing-indicator">
              <span>✍️ typing...</span>
              <div className="typing-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
          ) : (
            <div className={`user-status ${selectedUser.isOnline ? 'online' : 'offline'}`}>
              {selectedUser.isOnline ? '🟢 Online' : '🔘 Offline'}
            </div>
          )}
        </div>
        <button className="call-btn" onClick={handleStartCall} disabled={!selectedUser.isOnline} title="Call user">
          📞
        </button>
      </div>

      <div className="messages-container">
        {loading ? (
          <div className="loading">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="no-messages">No messages yet. Start the conversation!</div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={msg._id || index}
              className={`message ${msg.sender === currentUser.username ? 'sent' : 'received'} ${
                msg.deletedForMe ? 'deleted' : ''
              }`}
              onClick={() => setActiveMessageId(activeMessageId === msg._id ? null : msg._id)}
            >
              {msg.replyTo && (
                <div className="message-reply-quote">
                  <div className="reply-quote-sender">↩️ {msg.replyTo.sender}</div>
                  <div className="reply-quote-text">{msg.replyTo.text}</div>
                </div>
              )}
              <div className="message-content">{msg.text}</div>
              <div className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                {msg.sender === currentUser.username && (
                  <span className={`read-status ${msg.isRead ? 'read' : 'delivered'}`}>
                    {msg.isRead ? '✓✓' : '✓'}
                  </span>
                )}
              </div>

              {activeMessageId === msg._id && !msg.deletedForMe && (
                <MessageActions
                  messageId={msg._id}
                  message={msg}
                  currentUsername={currentUser.username}
                  isOwnMessage={msg.sender === currentUser.username}
                  onDelete={handleDeleteMessage}
                  onReply={handleReplyClick}
                  onClose={() => setActiveMessageId(null)}
                />
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatWindow;
