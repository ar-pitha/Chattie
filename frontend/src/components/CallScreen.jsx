import React, { useEffect } from 'react';
import '../styles/CallScreen.css';

const CallScreen = ({ callStatus, remoteUser, onEndCall, remoteAudioRef, isMuted }) => {
  // Handle browser autoplay policy - allow audio to play on user click
  useEffect(() => {
    const handleUserInteraction = () => {
      if (remoteAudioRef?.current && remoteAudioRef.current.paused) {
        console.log('▶️ User clicked, attempting to resume audio...');
        remoteAudioRef.current.play().catch(err => {
          console.error('❌ Still cannot play audio:', err);
        });
      }
    };

    const screenElement = document.querySelector('.call-screen');
    if (screenElement) {
      screenElement.addEventListener('click', handleUserInteraction);
      return () => {
        screenElement.removeEventListener('click', handleUserInteraction);
      };
    }
  }, [remoteAudioRef]);

  if (!callStatus) return null;

  const getStatusMessage = () => {
    switch (callStatus) {
      case 'calling':
        return `Calling ${remoteUser}...`;
      case 'ringing':
        return `${remoteUser} is ringing...`;
      case 'connected':
        return 'Call Connected';
      case 'ended':
        return 'Call Ended';
      default:
        return '';
    }
  };

  return (
    <div className="call-screen">
      {/* Audio element for receiving remote audio */}
      <audio 
        ref={remoteAudioRef} 
        autoPlay={false}
        playsInline
        controls={false}
        crossOrigin="anonymous"
        onPlay={() => console.log('🎵 Audio started playing')}
        onPause={() => console.log('⏸️ Audio paused')}
        onError={(e) => console.error('Audio error:', e)}
      />
      
      <div className="call-overlay">
        <div className="call-info">
          <div className="call-avatar">📞</div>
          <h2>{remoteUser}</h2>
          <p className={`call-status ${callStatus}`}>{getStatusMessage()}</p>
        </div>

        <div className="call-controls">
          {callStatus !== 'ended' && (
            <>
              <button className="call-control-btn mute-btn" title={isMuted ? 'Unmute' : 'Mute'}>
                🔊
              </button>
              <button className="call-control-btn end-btn" onClick={onEndCall} title="End Call">
                📵
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallScreen;
