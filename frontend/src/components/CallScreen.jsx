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

  // Format duration as MM:SS
  useEffect(() => {
    const minutes = Math.floor(callDuration / 60);
    const seconds = callDuration % 60;
    setFormattedTime(
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    );
  }, [callDuration]);

  // Handle browser autoplay policy - allow audio to play on user click
  useEffect(() => {
    const handleUserInteraction = () => {
      console.log('👆 User interaction detected');
      
      if (remoteAudioRef?.current) {
        // Try to play audio on user click
        if (remoteAudioRef.current.paused) {
          console.log('▶️ User clicked, attempting to resume audio...');
          remoteAudioRef.current.play()
            .then(() => {
              console.log('✅ Audio resumed after user click');
              console.log(`   Paused: ${remoteAudioRef.current.paused}`);
              console.log(`   Volume: ${remoteAudioRef.current.volume}`);
            })
            .catch(err => {
              console.error('❌ Still cannot play audio:', err);
            });
        }
      }
      
      // Also try the global retry function if it exists
      if (window.__retryAudioPlay) {
        console.log('🔄 Calling global retry function...');
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

  const getNetworkQualityIcon = () => {
    switch (networkQuality) {
      case 'excellent':
        return '📶'; // Full signal
      case 'good':
        return '📱'; // Good signal
      case 'fair':
        return '⚠️'; // Fair signal
      case 'poor':
        return '🔴'; // Poor signal
      default:
        return '📶';
    }
  };

  return (
    <div className="call-screen">
      {/* Audio element for receiving remote audio */}
      <audio 
        ref={remoteAudioRef} 
        autoPlay={true}
        playsInline
        controls={false}
        crossOrigin="anonymous"
        onPlay={() => console.log('🎵 Audio started playing')}
        onPause={() => console.log('⏸️ Audio paused')}
        onError={(e) => console.error('Audio error:', e)}
      />
      
      <div className="call-overlay">
        {/* Network Warning Banner */}
        {networkWarning && (
          <div className="network-warning">
            {networkWarning}
          </div>
        )}

        <div className="call-info">
          <div className="call-avatar">📞</div>
          <h2>{remoteUser}</h2>
          <p className={`call-status ${callStatus}`}>{getStatusMessage()}</p>
          
          {/* Call Duration and Network Quality */}
          {callStatus === 'connected' && (
            <div className="call-stats">
              <span className="call-duration">⏱️ {formattedTime}</span>
              <span className="network-quality" title={`Network: ${networkQuality}`}>
                {getNetworkQualityIcon()} {networkQuality}
              </span>
            </div>
          )}
        </div>

        <div className="call-controls">
          {callStatus !== 'ended' && (
            <>
              {/* Mute Button */}
              <button 
                className={`call-control-btn mute-btn ${isMuted ? 'active' : ''}`} 
                onClick={onToggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>
              
              {/* Speaker Button */}
              <button 
                className={`call-control-btn speaker-btn ${speakerEnabled ? 'active' : ''}`} 
                onClick={onToggleSpeaker}
                title={speakerEnabled ? 'Speaker On' : 'Speaker Off'}
              >
                {speakerEnabled ? '🔈' : '🔇'}
              </button>
              
              {/* End Call Button */}
              <button 
                className="call-control-btn end-btn" 
                onClick={onEndCall} 
                title="End Call"
              >
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
