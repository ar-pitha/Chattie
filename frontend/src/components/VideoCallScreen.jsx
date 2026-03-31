import React, { useEffect, useState, useRef } from 'react';
import '../styles/VideoCallScreen.css';

const VideoCallScreen = ({
  callStatus,
  remoteUser,
  onEndCall,
  remoteAudioRef,
  remoteVideoRef,
  localVideoRef,
  isMuted,
  callDuration,
  networkQuality,
  networkWarning,
  isVideoEnabled,
  onToggleMute,
  onToggleSpeaker,
  onToggleVideo,
  onFlipCamera,
  facingMode,
  speakerEnabled,
  isPip,
  onTogglePip
}) => {
  const [formattedTime, setFormattedTime] = useState('00:00');
  const [swapped, setSwapped] = useState(false);

  // PiP drag state
  const pipRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  useEffect(() => {
    const minutes = Math.floor(callDuration / 60);
    const seconds = callDuration % 60;
    setFormattedTime(
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    );
  }, [callDuration]);

  // PiP drag handlers
  const handlePipTouchStart = (e) => {
    if (!isPip) return;
    const touch = e.touches[0];
    const el = pipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dragging: true, startX: touch.clientX, startY: touch.clientY, origX: rect.left, origY: rect.top };
  };
  const handlePipTouchMove = (e) => {
    const d = dragRef.current;
    if (!d.dragging || !isPip) return;
    const touch = e.touches[0];
    const dx = touch.clientX - d.startX;
    const dy = touch.clientY - d.startY;
    const el = pipRef.current;
    if (el) {
      el.style.left = `${d.origX + dx}px`;
      el.style.top = `${d.origY + dy}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transition = 'none';
    }
  };
  const handlePipTouchEnd = () => {
    dragRef.current.dragging = false;
  };

  // Mouse drag for desktop PiP
  const handlePipMouseDown = (e) => {
    if (!isPip) return;
    const el = pipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };

    const onMouseMove = (ev) => {
      const d = dragRef.current;
      if (!d.dragging) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      el.style.left = `${d.origX + dx}px`;
      el.style.top = `${d.origY + dy}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transition = 'none';
    };
    const onMouseUp = () => {
      dragRef.current.dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  if (!callStatus) return null;

  const getStatusMessage = () => {
    switch (callStatus) {
      case 'calling': return `Calling ${remoteUser}...`;
      case 'ringing': return `${remoteUser} is ringing...`;
      case 'connected': return 'Call Connected';
      case 'ended': return 'Call Ended';
      default: return '';
    }
  };

  const getInitials = (name) => name ? name.charAt(0).toUpperCase() : '?';

  const getNetworkIcon = () => {
    const bars = networkQuality === 'excellent' ? 4 : networkQuality === 'good' ? 3 : networkQuality === 'fair' ? 2 : 1;
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <rect x="2" y="18" width="4" height="4" opacity={bars >= 1 ? 1 : 0.3} rx="1"/>
        <rect x="8" y="13" width="4" height="9" opacity={bars >= 2 ? 1 : 0.3} rx="1"/>
        <rect x="14" y="8" width="4" height="14" opacity={bars >= 3 ? 1 : 0.3} rx="1"/>
        <rect x="20" y="3" width="4" height="19" opacity={bars >= 4 ? 1 : 0.3} rx="1"/>
      </svg>
    );
  };

  // PiP (picture-in-picture) mode — small draggable floating window
  if (isPip) {
    return (
      <div
        className="video-call-pip"
        ref={pipRef}
        onTouchStart={handlePipTouchStart}
        onTouchMove={handlePipTouchMove}
        onTouchEnd={handlePipTouchEnd}
        onMouseDown={handlePipMouseDown}
        onClick={(e) => {
          // Only expand if not dragging
          if (Math.abs(e.clientX - dragRef.current.startX) < 5) {
            onTogglePip?.();
          }
        }}
      >
        <audio ref={remoteAudioRef} autoPlay playsInline controls={false} />
        <video
          ref={remoteVideoRef}
          className="pip-video"
          autoPlay
          playsInline
          muted={false}
        />
        {isVideoEnabled && (
          <video
            ref={localVideoRef}
            className={`pip-local-video ${facingMode === 'environment' ? 'no-mirror' : ''}`}
            autoPlay
            playsInline
            muted
          />
        )}
        <div className="pip-info">
          <span className="pip-name">{remoteUser}</span>
          {callStatus === 'connected' && <span className="pip-time">{formattedTime}</span>}
        </div>
        <button className="pip-end-btn" onClick={(e) => { e.stopPropagation(); onEndCall(); }} aria-label="End call">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    );
  }

  // Full-screen video call
  // Both videos always rendered with their original refs (WebRTC streams stay attached).
  // Swapping just changes which container is big vs small via CSS classes.
  return (
    <div className="video-call-screen">
      <audio ref={remoteAudioRef} autoPlay playsInline controls={false} />

      {/* Remote video — always keeps remoteVideoRef */}
      <div className={swapped ? 'local-video-container' : 'remote-video-container'} onClick={swapped ? () => setSwapped(false) : undefined}>
        <video
          ref={remoteVideoRef}
          className={swapped ? 'local-video no-mirror' : 'remote-video'}
          autoPlay
          playsInline
          muted={false}
        />
        {swapped && (
          <div className="swap-hint">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </div>
        )}
      </div>

      {/* Local video — always keeps localVideoRef */}
      {isVideoEnabled && (
        <div className={swapped ? 'remote-video-container' : 'local-video-container'} onClick={!swapped ? () => setSwapped(true) : undefined}>
          <video
            ref={localVideoRef}
            className={swapped ? 'remote-video mirror' : `local-video ${facingMode === 'environment' ? 'no-mirror' : ''}`}
            autoPlay
            playsInline
            muted
          />
          {!swapped && (
            <div className="swap-hint">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Overlay info — always on the big screen */}
      {networkWarning && (
        <div className="network-warning">{networkWarning}</div>
      )}

      <div className="call-info-overlay">
        <div className="call-header">
          <div className={`call-avatar ${callStatus === 'ringing' || callStatus === 'calling' ? 'ringing' : ''}`}>
            {getInitials(remoteUser)}
          </div>
          <div className="call-header-info">
            <h2>{swapped ? 'You' : remoteUser}</h2>
            <p className={`call-status ${callStatus}`}>{getStatusMessage()}</p>
          </div>
        </div>

        {callStatus === 'connected' && (
          <div className="call-stats">
            <span className="call-duration">{formattedTime}</span>
            <span className="network-quality" title={`Network: ${networkQuality}`}>
              {getNetworkIcon()} {networkQuality}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="video-call-controls">
        <button className={`control-btn ${isMuted ? 'active' : ''}`} onClick={onToggleMute} title={isMuted ? 'Unmute' : 'Mute'} aria-label={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5v6M1 5v6c0 4.4 3.6 8 8 8h4M1 1l22 22"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v12a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>

        <button className={`control-btn ${isVideoEnabled ? '' : 'active'}`} onClick={onToggleVideo} title={isVideoEnabled ? 'Turn off video' : 'Turn on video'}>
          {isVideoEnabled ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5v6m0 0l-7-5M16 12l7-5V7m0 0H1m15 14H1V5m15 14L1 1M1 19l22-22"/>
            </svg>
          )}
        </button>

        <button className={`control-btn ${speakerEnabled ? 'active' : ''}`} onClick={onToggleSpeaker} title={speakerEnabled ? 'Earpiece mode' : 'Speaker mode'}>
          {speakerEnabled ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M23 9v6"/>
            </svg>
          )}
        </button>

        {isVideoEnabled && (
          <button className="control-btn flip-btn" onClick={onFlipCamera} title="Flip camera">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/>
              <path d="M4 8V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/>
              <polyline points="16 12 12 8 8 12"/><polyline points="8 12 12 16 16 12"/>
            </svg>
          </button>
        )}

        {/* PiP minimize button */}
        <button className="control-btn pip-btn" onClick={onTogglePip} title="Picture in picture">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <rect x="12" y="10" width="8" height="6" rx="1" ry="1" fill="rgba(255,255,255,0.3)"/>
          </svg>
        </button>

        <button className="control-btn end-btn" onClick={onEndCall} title="End call">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="23" y1="1" x2="1" y2="23"/><line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default VideoCallScreen;
