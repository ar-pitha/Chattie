import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { chatAPI, mediaAPI } from "../utils/api";
import {
  onReceiveMessage,
  onDeleteMessage,
  onDeleteMessageForMe,
  onTypingIndicator,
  onStopTyping,
  onMessageStatusUpdated,
  onCallUser,
  onAnswerCall,
  onIceCandidate,
  onEndCall,
  emitMessageSeen,
  emitMessageDelivered,
  emitClearUnreadCount,
  onMessageEdited,
  onMessagePinned,
  onReactionUpdated,
} from "../utils/socket";
import MessageActions from "./MessageActions";
import CallScreen from "./CallScreen";
import VideoCallScreen from "./VideoCallScreen";
import IncomingCallPopup from "./IncomingCallPopup";
import CallHistory from "./CallHistory";
import MediaMessage from "./MediaMessage";
// CallTypeSelector removed — call buttons now inline in header
import { useWebRTCVideo } from "../hooks/useWebRTCVideo";
import "../styles/ChatWindow.css";
import "../styles/MediaMessage.css";
import "../styles/VideoCallScreen.css";

const URL_REGEX =
  /(?:https?:\/\/|www\.)[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*/gi;

function linkifyText(text) {
  if (!text) return text;
  const parts = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_REGEX.source, "gi");
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const url = match[0];
    const href = url.startsWith("http") ? url : `https://${url}`;
    parts.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>,
    );
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
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const SingleTick = () => (
  <svg viewBox="0 0 16 15" width="16" height="15" fill="currentColor">
    <path d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
  </svg>
);

const DoubleTick = () => (
  <svg viewBox="0 0 16 15" width="16" height="15" fill="currentColor">
    <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.32.32 0 0 0-.484.033l-.36.462a.365.365 0 0 0 .063.51l1.36 1.23c.143.14.361.125.484-.033l6.186-7.953a.365.365 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
  </svg>
);

const ChatWindow = ({
  currentUser,
  selectedUser,
  messages,
  setMessages,
  onReply,
  onEdit,
  unreadCounts,
  onClearUnread,
  onBack,
  scrollTrigger,
  replyingTo,
  onMessageDeletedForAll,
  onReactionToMyMessage,
}) => {
  const [loading, setLoading] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const [activePanel, setActivePanel] = useState(null); // 'pinned' | 'starred' | 'callHistory' | null
  const [starredMessages, setStarredMessages] = useState([]);
  const [swipingMsgId, setSwipingMsgId] = useState(null);
  const [swipeX, setSwipeX] = useState(0);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const touchRef = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    longPressTimer: null,
    isSwiping: false,
    longPressed: false,
  });
  const isMobileDevice =
    typeof window !== "undefined" &&
    /iPhone|iPad|Android|webOS/i.test(navigator.userAgent);

  // Touch handlers for swipe-to-reply + long-press actions
  const handleTouchStart = useCallback((e, msgId) => {
    const touch = e.touches[0];
    touchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      isSwiping: false,
      longPressed: false,
      longPressTimer: setTimeout(() => {
        touchRef.current.longPressed = true;
        // Trigger haptic feedback if available
        if (navigator.vibrate) navigator.vibrate(30);
        setActiveMessageId(msgId);
      }, 500),
    };
  }, []);

  const handleTouchMove = useCallback((e, msgId) => {
    const t = touchRef.current;
    const touch = e.touches[0];
    const dx = touch.clientX - t.startX;
    const dy = touch.clientY - t.startY;

    // If vertical scroll detected, cancel swipe and long press
    if (Math.abs(dy) > 10 && !t.isSwiping) {
      clearTimeout(t.longPressTimer);
      return;
    }

    // Swipe right detection (only positive direction)
    if (dx > 10) {
      clearTimeout(t.longPressTimer);
      t.isSwiping = true;
      const clamped = Math.min(dx, 80);
      setSwipingMsgId(msgId);
      setSwipeX(clamped);
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e, msg) => {
      const t = touchRef.current;
      clearTimeout(t.longPressTimer);

      if (t.isSwiping && swipeX > 50) {
        // Swipe threshold reached — trigger reply
        handleReplyClick(msg);
      } else if (!t.longPressed && !t.isSwiping && Date.now() - t.startTime < 300) {
        // Quick tap — always open emoji picker on mobile
        if (msg.deletedForAll) return;
        setEmojiPickerMsgId(msg._id);
        setActiveMessageId(null);
      }

      setSwipingMsgId(null);
      setSwipeX(0);
      t.isSwiping = false;
    },
    [swipeX],
  );

  const {
    callStatus,
    incomingCall,
    incomingCaller,
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    handleRemoteEndCall,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    cleanup,
    callDuration,
    isMuted,
    speakerEnabled,
    networkQuality,
    networkWarning,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
    flipCamera,
    facingMode,
    isVideoEnabled,
    callType,
  } = useWebRTCVideo(currentUser.username, selectedUser?.username);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    setShowScrollBtn(
      container.scrollHeight - container.scrollTop - container.clientHeight >
        100,
    );
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const scrollToReplyOriginal = useCallback((replyToMessageId) => {
    if (!replyToMessageId) return;
    const el = messagesContainerRef.current?.querySelector(
      `[data-msgid="${replyToMessageId}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
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
        setMessages((prev) =>
          prev.map((msg) =>
            String(msg._id) === String(data.messageId)
              ? { ...msg, status: data.status }
              : msg,
          ),
        );
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
    console.log(
      `🎧 [ChatWindow] Setting up receive_message listener for ${selectedUser?.username}`,
    );
    const unsubscribe = onReceiveMessage((message) => {
      console.log(`💬 ChatWindow received message:`, {
        from: message.sender,
        to: message.receiver,
        text: message.text,
        selectedUserUsername: selectedUser?.username,
        currentUserUsername: currentUser.username,
      });

      const isForConvo =
        selectedUser &&
        ((message.sender === currentUser.username &&
          message.receiver === selectedUser.username) ||
          (message.sender === selectedUser.username &&
            message.receiver === currentUser.username));

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
          const dup = prev.some(
            (m) =>
              m.sender === message.sender &&
              m.receiver === message.receiver &&
              m.text === message.text &&
              Math.abs(new Date(m.timestamp) - new Date(message.timestamp)) <
                2000,
          );
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
      console.log(
        `🎧 [ChatWindow] Unsubscribing from receive_message listener for ${selectedUser?.username}`,
      );
      unsubscribe();
    };
  }, [selectedUser?.username, currentUser.username]);

  useEffect(() => {
    return onDeleteMessage((d) =>
      setMessages((p) =>
        p.map((m) =>
          m._id === d.messageId
            ? {
                ...m,
                text: "This message was deleted",
                deletedForAll: true,
                media: null,
                replyTo: null,
              }
            : m,
        ),
      ),
    );
  }, [setMessages]);
  useEffect(() => {
    return onDeleteMessageForMe((d) => {
      // Only hide the message if the current user is the one who deleted it
      if (d.username === currentUser.username) {
        setMessages((p) => p.filter((m) => m._id !== d.messageId));
      }
    });
  }, [setMessages, currentUser.username]);
  const typingTimeoutRef = useRef(null);
  useEffect(() => {
    const unsub = onTypingIndicator((d) => {
      if (
        d.username === selectedUser?.username &&
        d.receiver === currentUser.username
      ) {
        setIsTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
      }
    });
    return () => {
      unsub();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [selectedUser, currentUser.username]);
  useEffect(() => {
    return onStopTyping((d) => {
      if (
        d.username === selectedUser?.username &&
        d.receiver === currentUser.username
      ) {
        setIsTyping(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      }
    });
  }, [selectedUser, currentUser.username]);
  useEffect(() => {
    return onCallUser((d) =>
      handleOffer(d.offer, d.from, d.callType || "audio"),
    );
  }, [handleOffer]);
  useEffect(() => {
    return onAnswerCall((d) => handleAnswer(d.answer));
  }, [handleAnswer]);
  useEffect(() => {
    return onIceCandidate((d) => handleIceCandidate(d.candidate));
  }, [handleIceCandidate]);
  useEffect(() => {
    return onEndCall(() => handleRemoteEndCall());
  }, [handleRemoteEndCall]);

  // Listen for message edits
  useEffect(() => {
    return onMessageEdited((d) => {
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === String(d.messageId)
            ? { ...m, text: d.text, editedAt: d.editedAt }
            : m,
        ),
      );
    });
  }, [setMessages]);

  // Listen for message pin/unpin
  useEffect(() => {
    return onMessagePinned((d) => {
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === String(d.messageId)
            ? { ...m, pinned: d.pinned, pinnedBy: d.pinnedBy }
            : m,
        ),
      );
      setPinnedMessages((prev) => {
        if (d.pinned)
          return [
            d.message,
            ...prev.filter((m) => String(m._id) !== String(d.messageId)),
          ];
        return prev.filter((m) => String(m._id) !== String(d.messageId));
      });
    });
  }, [setMessages]);

  // Keep a ref to messages so socket callback can read current messages
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Listen for reaction updates
  const onReactionToMyMessageRef = useRef(onReactionToMyMessage);
  useEffect(() => { onReactionToMyMessageRef.current = onReactionToMyMessage; }, [onReactionToMyMessage]);

  useEffect(() => {
    return onReactionUpdated((d) => {
      // Check ownership from the latest messages ref (not inside state updater)
      if (d.added && d.username !== currentUser.username) {
        const reactedMsg = messagesRef.current.find((m) => String(m._id) === String(d.messageId));
        if (reactedMsg && reactedMsg.sender === currentUser.username) {
          onReactionToMyMessageRef.current?.(d.username, d.emoji, reactedMsg.text);
        }
      }
      // Update messages state
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === String(d.messageId)
            ? { ...m, reactions: d.reactions }
            : m,
        ),
      );
    });
  }, [setMessages, currentUser.username]);

  // Dismiss emoji picker / actions when tapping outside on mobile
  useEffect(() => {
    if (!isMobileDevice) return;
    const handler = (e) => {
      // If tap is outside any .message, close everything
      if (!e.target.closest('.message')) {
        setEmojiPickerMsgId(null);
        setActiveMessageId(null);
      }
    };
    document.addEventListener('touchstart', handler);
    return () => document.removeEventListener('touchstart', handler);
  }, [isMobileDevice]);

  // Fetch pinned messages when chat opens
  useEffect(() => {
    if (selectedUser) {
      chatAPI
        .getPinnedMessages(currentUser.username, selectedUser.username)
        .then((res) => setPinnedMessages(res.data || []))
        .catch(() => setPinnedMessages([]));
    }
  }, [selectedUser?.username, currentUser.username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const response = await chatAPI.getMessages(
        currentUser.username,
        selectedUser.username,
      );

      // Debug log to check media field structure
      const messagesWithMedia = response.data.filter(
        (m) => m.media && m.media.fileId,
      );
      const messagesWithoutMedia = response.data.filter(
        (m) => !m.media || !m.media.fileId,
      );

      console.log(
        `📊 Messages fetched - Total: ${response.data.length}, With Media: ${messagesWithMedia.length}, Without: ${messagesWithoutMedia.length}`,
      );

      if (messagesWithMedia.length > 0) {
        console.log("✅ Sample media message:", messagesWithMedia[0]);
      }
      if (messagesWithoutMedia.length > 0 && response.data[0]) {
        console.log("📝 Sample text message:", messagesWithoutMedia[0]);
      }

      setMessages(response.data);

      // Mark unseen messages from the other user as 'seen' via socket
      // This notifies the sender in real-time so their ticks update
      const unseenFromOther = response.data.filter(
        (msg) => msg.sender === selectedUser.username && msg.status !== "seen",
      );
      unseenFromOther.forEach((msg) => {
        emitMessageSeen(msg._id, currentUser.username, msg.sender);
      });

      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }),
        50,
      );
    } catch (error) {
      console.error("Error fetching messages:", error);
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
      setMessages((p) =>
        p.map((m) =>
          m._id === messageId
            ? {
                ...m,
                text: "This message was deleted",
                deletedForAll: true,
                media: null,
                replyTo: null,
              }
            : m,
        ),
      );
      onMessageDeletedForAll?.(selectedUser?.username);
    }
  };

  const handleReplyClick = (message) => {
    onReply?.({ id: message._id, text: message.text, sender: message.sender });
  };

  const handleEditClick = (message) => {
    onEdit?.({ id: message._id, text: message.text, sender: message.sender });
  };

  const handleStarToggle = (messageId, username) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (String(m._id) !== String(messageId)) return m;
        const starred = m.starredBy || [];
        const isStarred = starred.includes(username);
        return {
          ...m,
          starredBy: isStarred
            ? starred.filter((u) => u !== username)
            : [...starred, username],
        };
      }),
    );
  };

  const handlePinToggle = (messageId, pinned) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (String(m._id) !== String(messageId)) return m;
        return {
          ...m,
          pinned,
          pinnedBy: pinned ? currentUser.username : null,
        };
      }),
    );
    // Also update pinned messages panel
    setPinnedMessages((prev) => {
      if (!pinned) {
        return prev.filter((p) => String(p._id) !== String(messageId));
      }
      const msg = messages.find((m) => String(m._id) === String(messageId));
      if (msg && !prev.some((p) => String(p._id) === String(messageId))) {
        return [msg, ...prev];
      }
      return prev;
    });
  };

  const handleReaction = (messageId, reactions) => {
    setMessages((prev) =>
      prev.map((m) =>
        String(m._id) === String(messageId)
          ? { ...m, reactions }
          : m,
      ),
    );
  };

  const openPanel = async (panel) => {
    setShowMenu(false);
    if (activePanel === panel) {
      setActivePanel(null);
      return;
    }
    setActivePanel(panel);
    if (panel === "starred") {
      try {
        const res = await chatAPI.getStarredMessages(currentUser.username);
        // Filter to only this conversation
        const convoStarred = (res.data || []).filter(
          (m) =>
            (m.sender === selectedUser.username &&
              m.receiver === currentUser.username) ||
            (m.sender === currentUser.username &&
              m.receiver === selectedUser.username),
        );
        setStarredMessages(convoStarred);
      } catch {
        setStarredMessages([]);
      }
    }
  };

  const handleStartAudioCall = () => {
    if (selectedUser.isOnline) startCall("audio");
    else alert(`${selectedUser.username} is offline`);
  };

  const handleStartVideoCall = () => {
    if (selectedUser.isOnline) startCall("video");
    else alert(`${selectedUser.username} is offline`);
  };

  const groupedMessages = useMemo(() => {
    const groups = [];
    let lastDate = "";
    messages.forEach((msg) => {
      const msgDate = new Date(msg.timestamp).toDateString();
      if (msgDate !== lastDate) {
        groups.push({
          type: "date",
          date: msg.timestamp,
          key: `date-${msgDate}`,
        });
        lastDate = msgDate;
      }
      groups.push({
        type: "message",
        data: msg,
        key: msg._id || `msg-${groups.length}`,
      });
    });
    return groups;
  }, [messages]);

  const getInitial = (name) => (name ? name.charAt(0).toUpperCase() : "?");

  if (!selectedUser) {
    return (
      <div className="chat-window empty">
        <div className="empty-state">
          <div className="empty-state-icon-wrap">
            <svg
              viewBox="0 0 200 160"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="200"
              height="160"
              className="empty-state-svg"
            >
              <defs>
                <linearGradient id="bubbleGrad1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6C63FF" />
                  <stop offset="100%" stopColor="#8B7CFF" />
                </linearGradient>
                <linearGradient id="bubbleGrad2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#E8E6FF" />
                  <stop offset="100%" stopColor="#F3F1FF" />
                </linearGradient>
                <filter
                  id="softShadow"
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feDropShadow
                    dx="0"
                    dy="4"
                    stdDeviation="8"
                    floodColor="#6C63FF"
                    floodOpacity="0.15"
                  />
                </filter>
              </defs>

              {/* Received bubble */}
              <g filter="url(#softShadow)">
                <rect
                  x="20"
                  y="16"
                  width="110"
                  height="44"
                  rx="16"
                  fill="url(#bubbleGrad2)"
                />
                <rect
                  x="20"
                  y="44"
                  width="12"
                  height="12"
                  rx="2"
                  fill="url(#bubbleGrad2)"
                  transform="rotate(45, 26, 50)"
                />
                <rect
                  x="34"
                  y="30"
                  width="72"
                  height="6"
                  rx="3"
                  fill="#C5C0F0"
                />
                <rect
                  x="34"
                  y="44"
                  width="50"
                  height="6"
                  rx="3"
                  fill="#D8D4F7"
                />
              </g>

              {/* Sent bubble */}
              <g filter="url(#softShadow)">
                <rect
                  x="70"
                  y="74"
                  width="110"
                  height="44"
                  rx="16"
                  fill="url(#bubbleGrad1)"
                />
                <rect
                  x="168"
                  y="102"
                  width="12"
                  height="12"
                  rx="2"
                  fill="url(#bubbleGrad1)"
                  transform="rotate(45, 174, 108)"
                />
                <rect
                  x="84"
                  y="88"
                  width="78"
                  height="6"
                  rx="3"
                  fill="rgba(255,255,255,0.5)"
                />
                <rect
                  x="84"
                  y="102"
                  width="54"
                  height="6"
                  rx="3"
                  fill="rgba(255,255,255,0.35)"
                />
              </g>

              {/* Typing dots */}
              <g>
                <rect
                  x="20"
                  y="72"
                  width="50"
                  height="30"
                  rx="14"
                  fill="url(#bubbleGrad2)"
                  opacity="0.7"
                />
                <circle
                  className="anim-dot anim-dot-1"
                  cx="34"
                  cy="87"
                  r="3.5"
                  fill="#9B93E0"
                />
                <circle
                  className="anim-dot anim-dot-2"
                  cx="45"
                  cy="87"
                  r="3.5"
                  fill="#9B93E0"
                />
                <circle
                  className="anim-dot anim-dot-3"
                  cx="56"
                  cy="87"
                  r="3.5"
                  fill="#9B93E0"
                />
              </g>
            </svg>
          </div>
          <h2 className="empty-state-title">Chattie</h2>
          <p className="empty-state-subtitle">
            Secure, enterprise-style real-time collaboration
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      {callType === "video" && callStatus && (
        <VideoCallScreen
          callStatus={callStatus}
          remoteUser={selectedUser.username}
          onEndCall={endCall}
          remoteAudioRef={remoteAudioRef}
          remoteVideoRef={remoteVideoRef}
          localVideoRef={localVideoRef}
          isMuted={isMuted}
          callDuration={callDuration}
          networkQuality={networkQuality}
          networkWarning={networkWarning}
          onToggleMute={toggleMute}
          onToggleSpeaker={toggleSpeaker}
          onToggleVideo={toggleVideo}
          onFlipCamera={flipCamera}
          facingMode={facingMode}
          isVideoEnabled={isVideoEnabled}
          speakerEnabled={speakerEnabled}
        />
      )}
      {callType === "audio" && callStatus && (
        <CallScreen
          callStatus={callStatus}
          remoteUser={selectedUser.username}
          onEndCall={endCall}
          remoteAudioRef={remoteAudioRef}
          isMuted={isMuted}
          callDuration={callDuration}
          networkQuality={networkQuality}
          networkWarning={networkWarning}
          onToggleMute={toggleMute}
          onToggleSpeaker={toggleSpeaker}
          speakerEnabled={speakerEnabled}
        />
      )}
      {incomingCall && (
        <IncomingCallPopup
          caller={incomingCaller}
          onAccept={acceptCall}
          onReject={rejectCall}
          callType={callType}
        />
      )}

      {/* Chat header with back arrow */}
      <div className="chat-header">
        <div className="header-user">
          {onBack && (
            <button
              className="back-btn"
              onClick={onBack}
              aria-label="Back to chats"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <div className="chat-header-avatar">
            {selectedUser.profilePic ? (
              <img
                src={mediaAPI.getProfilePicUrl(selectedUser.profilePic)}
                alt={selectedUser.username}
              />
            ) : (
              <svg viewBox="0 0 212 212" width="100%" height="100%">
                <path
                  fill="rgba(255,255,255,0.3)"
                  d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0z"
                />
                <path
                  fill="#fff"
                  d="M106 45c20.4 0 37 16.6 37 37s-16.6 37-37 37-37-16.6-37-37 16.6-37 37-37zm0 100c33.1 0 60 14.3 60 32v8H46v-8c0-17.7 26.9-32 60-32z"
                />
              </svg>
            )}
          </div>
          <div className="header-info">
            <h2>{selectedUser.username}</h2>
            {isTyping ? (
              <div className="typing-indicator">
                <span className="typing-indicator-text">typing</span>
                <div className="typing-dots-header">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            ) : selectedUser.isOnline ? (
              <div className="header-status online">online</div>
            ) : null}
          </div>
        </div>
        <div className="header-actions">
          <button
            className="chat-header-btn"
            onClick={handleStartVideoCall}
            disabled={!selectedUser.isOnline || !!callStatus}
            aria-label="Video call"
            title="Video call"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </button>
          <button
            className="chat-header-btn"
            onClick={handleStartAudioCall}
            disabled={!selectedUser.isOnline || !!callStatus}
            aria-label="Voice call"
            title="Voice call"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>
          <div className="header-menu-wrap">
            <button
              className={`chat-header-btn ${showMenu ? "active" : ""}`}
              onClick={() => setShowMenu(!showMenu)}
              aria-label="More options"
              title="More"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="20"
                height="20"
              >
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {showMenu && (
              <div
                className="header-dropdown"
                onClick={() => setShowMenu(false)}
              >
                <button
                  className="dropdown-item"
                  onClick={() => openPanel("pinned")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="17" x2="12" y2="22" />
                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" />
                  </svg>
                  Pinned texts
                  {pinnedMessages.length > 0 && (
                    <span className="dropdown-badge">
                      {pinnedMessages.length}
                    </span>
                  )}
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => openPanel("starred")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Starred Messages
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => openPanel("callHistory")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Call History
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Most recent pinned message below header */}
      {pinnedMessages.length > 0 && (
        <div
          className="pinned-bar"
          onClick={() => scrollToReplyOriginal(pinnedMessages[0]._id)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="14"
            height="14"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="17" x2="12" y2="22" />
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" />
          </svg>
          <span className="pinned-bar-text">{pinnedMessages[0].text}</span>
          {pinnedMessages.length > 1 && (
            <span className="pinned-bar-count">{pinnedMessages.length}</span>
          )}
        </div>
      )}

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
                if (item.type === "date") {
                  return (
                    <div key={item.key} className="date-separator">
                      <span className="date-separator-label">
                        {formatDateSeparator(item.date)}
                      </span>
                    </div>
                  );
                }
                const msg = item.data;
                const isSent = msg.sender === currentUser.username;

                // Debug logging
                if (msg.media) {
                  console.log("✅ Message HAS media field:", {
                    id: msg._id,
                    mediaType: msg.media.mediaType,
                    fileName: msg.media.fileName,
                    fileId: msg.media.fileId,
                  });
                } else if (msg.text && msg.text.includes("📎")) {
                  console.warn(
                    "⚠️ Message text has attachment emoji but no media field:",
                    msg.text,
                    msg,
                  );
                }

                // Call event messages — centered, no bubble
                if (msg.callEvent) {
                  const ce = msg.callEvent;
                  const isVideo = ce.callType === "video";
                  const isMissed =
                    ce.status === "missed" || ce.status === "rejected";
                  return (
                    <div key={item.key} className="call-event-msg">
                      <div
                        className={`call-event-icon ${isMissed ? "missed" : "completed"}`}
                      >
                        {isVideo ? (
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect
                              x="1"
                              y="5"
                              width="15"
                              height="14"
                              rx="2"
                              ry="2"
                            />
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
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        )}
                      </div>
                      <span className="call-event-text">{msg.text}</span>
                      <span className="call-event-time">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                }

                const isStarred = msg.starredBy?.includes(currentUser.username);

                const msgSwipeStyle =
                  swipingMsgId === msg._id && swipeX > 0
                    ? {
                        transform: `translateX(${swipeX}px)`,
                        transition: "none",
                      }
                    : swipingMsgId !== msg._id
                      ? {
                          transform: "translateX(0)",
                          transition: "transform 200ms ease-out",
                        }
                      : {};

                return (
                  <div
                    key={item.key}
                    data-msgid={msg._id}
                    className={`message ${isSent ? "sent" : "received"} ${msg.deletedForAll ? "deleted" : ""} ${highlightedMessageId === msg._id ? "highlighted" : ""} ${msg.pinned ? "pinned-msg" : ""}`}
                    onClick={(e) => {
                      if (msg.deletedForAll) return;
                      if (isMobileDevice) return;
                      e.stopPropagation();
                      setActiveMessageId(
                        activeMessageId === msg._id ? null : msg._id,
                      );
                    }}
                    onMouseEnter={() => {
                      if (!isMobileDevice && !msg.deletedForAll && !msg.callEvent) {
                        clearTimeout(hoverTimeoutRef.current);
                        setHoveredMsgId(msg._id);
                      }
                    }}
                    onMouseLeave={() => {
                      if (isMobileDevice) return;
                      hoverTimeoutRef.current = setTimeout(() => setHoveredMsgId(null), 300);
                    }}
                    onTouchStart={(e) =>
                      !msg.deletedForAll && handleTouchStart(e, msg._id)
                    }
                    onTouchMove={(e) =>
                      !msg.deletedForAll && handleTouchMove(e, msg._id)
                    }
                    onTouchEnd={(e) =>
                      !msg.deletedForAll && handleTouchEnd(e, msg)
                    }
                    style={msgSwipeStyle}
                  >
                    {msg.media && msg.media.fileId && !msg.deletedForAll ? (
                      <>
                        <MediaMessage message={msg} isOwn={isSent} onReply={handleReplyClick} replyingTo={replyingTo} />
                        <div
                          className="message-footer"
                          style={{ paddingLeft: "12px", marginTop: "4px" }}
                        >
                          {msg.pinned && (
                            <span className="pin-indicator">
                              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="11" height="11">
                                <path d="M17 4v7l2 3v2h-6v5l-1 1-1-1v-5H5v-2l2-3V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2z"/>
                              </svg>
                            </span>
                          )}
                          {isStarred && (
                            <span className="star-indicator">&#9733;</span>
                          )}
                          {msg.editedAt && (
                            <span className="edited-label">edited</span>
                          )}
                          <span className="message-time">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {isSent && (
                            <span className={`tick-icon ${msg.status}`}>
                              {msg.status === "sent" && <SingleTick />}
                              {(msg.status === "delivered" ||
                                msg.status === "seen") && <DoubleTick />}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="message-bubble">
                        {msg.replyTo && !msg.deletedForAll && (
                          <div
                            className="message-reply-quote"
                            onClick={(e) => {
                              e.stopPropagation();
                              scrollToReplyOriginal(msg.replyTo.messageId);
                            }}
                          >
                            <div className="reply-quote-sender">
                              {msg.replyTo.sender}
                            </div>
                            <div className="reply-quote-text">
                              {msg.replyTo.text}
                            </div>
                          </div>
                        )}
                        <div className="message-text">
                          {msg.deletedForAll ? (
                            <span className="deleted-msg-text">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                width="13"
                                height="13"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <line
                                  x1="4.93"
                                  y1="4.93"
                                  x2="19.07"
                                  y2="19.07"
                                />
                              </svg>
                              This message was deleted
                            </span>
                          ) : (
                            linkifyText(msg.text)
                          )}
                        </div>
                        <div className="message-footer">
                          {msg.pinned && (
                            <span className="pin-indicator">
                              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="11" height="11">
                                <path d="M17 4v7l2 3v2h-6v5l-1 1-1-1v-5H5v-2l2-3V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2z"/>
                              </svg>
                            </span>
                          )}
                          {isStarred && (
                            <span className="star-indicator">&#9733;</span>
                          )}
                          {msg.editedAt && (
                            <span className="edited-label">edited</span>
                          )}
                          <span className="message-time">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {isSent && (
                            <span className={`tick-icon ${msg.status}`}>
                              {msg.status === "sent" && <SingleTick />}
                              {(msg.status === "delivered" ||
                                msg.status === "seen") && <DoubleTick />}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {msg.reactions && msg.reactions.length > 0 && !msg.deletedForAll && (
                      <div
                        className="reaction-badges-inline"
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                      >
                        {msg.reactions.map((r) => (
                          <span
                            key={r.emoji}
                            className={`reaction-pill ${r.users?.includes(currentUser.username) ? 'own' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              chatAPI.toggleReaction(msg._id, r.emoji, currentUser.username).then((res) => {
                                handleReaction(msg._id, res.data.reactions);
                              });
                            }}
                          >
                            {r.emoji}{r.users.length > 1 ? r.users.length : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Hover emoji picker (desktop) or tap emoji picker (mobile) */}
                    {((!isMobileDevice && hoveredMsgId === msg._id) || (isMobileDevice && emojiPickerMsgId === msg._id)) &&
                      !msg.deletedForAll && !msg.callEvent &&
                      activeMessageId !== msg._id && (
                      <div
                        className={`hover-emoji-picker ${isSent ? 'sent' : 'received'}`}
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                        onMouseEnter={() => clearTimeout(hoverTimeoutRef.current)}
                        onMouseLeave={() => { hoverTimeoutRef.current = setTimeout(() => setHoveredMsgId(null), 300); }}
                      >
                        {['👍', '❤️', '😂', '😢', '😮', '🔥'].map((emoji) => (
                          <button
                            key={emoji}
                            className={`hover-emoji-btn ${msg.reactions?.find(r => r.emoji === emoji && r.users?.includes(currentUser.username)) ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              chatAPI.toggleReaction(msg._id, emoji, currentUser.username).then((res) => {
                                handleReaction(msg._id, res.data.reactions);
                              });
                              setEmojiPickerMsgId(null);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                    {activeMessageId === msg._id &&
                      !msg.deletedForAll &&
                      !msg.callEvent && (
                        <MessageActions
                          messageId={msg._id}
                          message={msg}
                          currentUsername={currentUser.username}
                          isOwnMessage={isSent}
                          onDelete={handleDeleteMessage}
                          onReply={handleReplyClick}
                          onEdit={handleEditClick}
                          onStar={handleStarToggle}
                          onPin={handlePinToggle}
                          onClose={() => setActiveMessageId(null)}
                        />
                      )}
                  </div>
                );
              })}
              {isTyping && (
                <div className="typing-bubble">
                  <div className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {showScrollBtn && (
          <button
            className="scroll-to-bottom"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        {/* Slide-in panel for Pinned / Starred / Call History */}
        {activePanel === "callHistory" && (
          <CallHistory
            currentUser={currentUser}
            selectedUser={selectedUser}
            onClose={() => setActivePanel(null)}
          />
        )}
        {activePanel === "pinned" && (
          <div className="side-panel">
            <div className="side-panel-header">
              <button
                className="side-panel-back"
                onClick={() => setActivePanel(null)}
                aria-label="Back"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h3>Pinned Messages</h3>
              <span className="side-panel-count">{pinnedMessages.length}</span>
            </div>
            <div className="side-panel-list">
              {pinnedMessages.length === 0 ? (
                <div className="side-panel-empty">No pinned messages</div>
              ) : (
                pinnedMessages.map((pm) => (
                  <div
                    key={pm._id}
                    className="side-panel-item"
                    onClick={() => {
                      scrollToReplyOriginal(pm._id);
                      setActivePanel(null);
                    }}
                  >
                    <div className="side-panel-item-row">
                      <span className="side-panel-item-sender">
                        {pm.sender === currentUser.username ? "You" : pm.sender}
                      </span>
                      <span className="side-panel-item-time">
                        {new Date(pm.timestamp).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        ,{" "}
                        {new Date(pm.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="side-panel-item-text">{pm.text}</div>
                    {pm.pinnedBy && (
                      <div className="side-panel-item-meta">
                        Pinned by{" "}
                        {pm.pinnedBy === currentUser.username
                          ? "you"
                          : pm.pinnedBy}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {activePanel === "starred" && (
          <div className="side-panel">
            <div className="side-panel-header">
              <button
                className="side-panel-back"
                onClick={() => setActivePanel(null)}
                aria-label="Back"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <h3>Starred Messages</h3>
              <span className="side-panel-count">{starredMessages.length}</span>
            </div>
            <div className="side-panel-list">
              {starredMessages.length === 0 ? (
                <div className="side-panel-empty">No starred messages</div>
              ) : (
                starredMessages.map((sm) => (
                  <div
                    key={sm._id}
                    className="side-panel-item"
                    onClick={() => {
                      scrollToReplyOriginal(sm._id);
                      setActivePanel(null);
                    }}
                  >
                    <div className="side-panel-item-row">
                      <span className="side-panel-item-sender">
                        {sm.sender === currentUser.username ? "You" : sm.sender}
                      </span>
                      <span className="side-panel-item-time">
                        {new Date(sm.timestamp).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        ,{" "}
                        {new Date(sm.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="side-panel-item-text">{sm.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatWindow;
