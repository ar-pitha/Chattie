import React, { useEffect, useState } from 'react';
import '../styles/CallScreen.css';

const CallScreen = ({
  callStatus,
  remoteUser,
  onEndCall,
  remoteAudioRef,
  isMuted,
  callDuration,
  networkQuality,
  networkWarning,
  onToggleMute,
  onToggleSpeaker,
  speakerEnabled
}) => {
  const [formattedTime, setFormattedTime] = useState('00:00');

  useEffect(() => {
    const minutes = Math.floor(callDuration / 60);
    const seconds = callDuration % 60;
    setFormattedTime(
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    );
  }, [callDuration]);

  useEffect(() => {
    const handleUserInteraction = () => {
      if (remoteAudioRef?.current && remoteAudioRef.current.paused) {
        remoteAudioRef.current.play().catch(() => {});
      }
      if (window.__retryAudioPlay) {
        window.__retryAudioPlay();
      }
    };

    const screenElement = document.querySelector('.call-screen');
    if (screenElement) {
      screenElement.addEventListener('click', handleUserInteraction);
      screenElement.addEventListener('touchstart', handleUserInteraction);
      return () => {
        screenElement.removeEventListener('click', handleUserInteraction);
        screenElement.removeEventListener('touchstart', handleUserInteraction);
      };
    }
  }, [remoteAudioRef]);

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
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="18" width="4" height="4" opacity={bars >= 1 ? 1 : 0.3} rx="1"/>
        <rect x="8" y="13" width="4" height="9" opacity={bars >= 2 ? 1 : 0.3} rx="1"/>
        <rect x="14" y="8" width="4" height="14" opacity={bars >= 3 ? 1 : 0.3} rx="1"/>
        <rect x="20" y="3" width="4" height="19" opacity={bars >= 4 ? 1 : 0.3} rx="1"/>
      </svg>
    );
  };

  return (
    <div className="call-screen">
      <audio
        ref={remoteAudioRef}
        autoPlay={true}
        playsInline
        controls={false}
      />

      <div className="call-overlay">
        {networkWarning && (
          <div className="network-warning">{networkWarning}</div>
        )}

        <div className="call-info">
          <div className={`call-avatar-circle ${callStatus === 'ringing' || callStatus === 'calling' ? 'ringing' : ''}`}>
            {getInitials(remoteUser)}
          </div>
          <h2>{remoteUser}</h2>
          <p className={`call-status ${callStatus}`}>{getStatusMessage()}</p>

          {callStatus === 'connected' && (
            <div className="call-stats">
              <span className="call-duration">{formattedTime}</span>
              <span className="network-quality" title={`Network: ${networkQuality}`}>
                {getNetworkIcon()} {networkQuality}
              </span>
            </div>
          )}
        </div>

        <div className="call-controls">
          {callStatus !== 'ended' && (
            <>
              <button
                className={`call-control-btn mute-btn ${isMuted ? 'active' : ''}`}
                onClick={onToggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                )}
              </button>

              <button
                className={`call-control-btn speaker-btn ${speakerEnabled ? 'active' : ''}`}
                onClick={onToggleSpeaker}
                title={speakerEnabled ? 'Speaker On' : 'Speaker Off'}
                aria-label={speakerEnabled ? 'Disable speaker' : 'Enable speaker'}
              >
                {speakerEnabled ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <line x1="23" y1="9" x2="17" y2="15"/>
                    <line x1="17" y1="9" x2="23" y2="15"/>
                  </svg>
                )}
              </button>

              <button
                className="call-control-btn end-btn"
                onClick={onEndCall}
                title="End Call"
                aria-label="End call"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallScreen;
