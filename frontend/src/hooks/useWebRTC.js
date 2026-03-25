import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../utils/socket';
import { callAPI } from '../utils/api';

const STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
  'stun:stun4.l.google.com:19302',
  'stun:stunserver.org:3478'
];

// TURN servers for better connectivity across networks (mobile, different ISPs, etc)
const TURN_SERVERS = [
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

export const useWebRTC = (currentUser, remoteUser) => {
  const [callStatus, setCallStatus] = useState(null); // null, 'calling', 'ringing', 'connected', 'ended'
  const [incomingCall, setIncomingCall] = useState(false);
  const [incomingCaller, setIncomingCaller] = useState(null);
  const [callDuration, setCallDuration] = useState(0); // in seconds
  const [isMuted, setIsMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [networkQuality, setNetworkQuality] = useState('good'); // excellent, good, fair, poor
  const [networkWarning, setNetworkWarning] = useState(null);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const iceCandidatesRef = useRef([]);
  const callStartTimeRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const networkWarningTimeoutRef = useRef(null);

  // Initialize RTCPeerConnection
  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    // Combine STUN and TURN servers for better connectivity
    const iceServers = [
      ...STUN_SERVERS.map(url => ({ urls: url })),
      ...TURN_SERVERS
    ];

    const config = {
      iceServers: iceServers,
      iceCandidatePoolSize: 10
    };

    console.log('🔧 Creating peer connection with ICE servers:', iceServers.length);

    const peerConnection = new RTCPeerConnection(config);

    // Handle ICE candidates
    peerConnection.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        console.log('📡 ICE Candidate generated');
        console.log(`   Type: ${event.candidate.type}`);
        console.log(`   Protocol: ${event.candidate.protocol}`);
        console.log(`   Address: ${event.candidate.address}`);
        
        getSocket().emit('ice-candidate', {
          to: remoteUser,
          candidate: event.candidate
        });
        console.log(`   ✅ Sent to ${remoteUser}`);
      } else {
        console.log('ℹ️ ICE candidate gathering complete');
      }
    });

    // Handle remote stream
    peerConnection.addEventListener('track', (event) => {
      console.log('🎵 Remote audio track received');
      console.log(`   Track kind: ${event.track.kind}`);
      console.log(`   Track state: ${event.track.readyState}`);
      console.log(`   Streams: ${event.streams.length}`);
      
      // Fallback: Mark call as connected when we receive remote audio
      // (in case connectionstatechange event doesn't fire)
      if (event.track.kind === 'audio') {
        console.log('✅ Audio track received - updating call status to connected');
        setCallStatus('connected');
      }
      
      if (remoteAudioRef.current) {
        // Use the stream directly if available
        if (event.streams && event.streams.length > 0) {
          console.log('✅ Setting audio element srcObject to remote stream');
          remoteAudioRef.current.srcObject = event.streams[0];
        } else {
          // Fallback: create MediaStream with tracks
          console.log('⚠️  No streams in event, creating MediaStream');
          if (!remoteAudioRef.current.srcObject) {
            remoteAudioRef.current.srcObject = new MediaStream();
          }
          const remoteStream = remoteAudioRef.current.srcObject;
          remoteStream.addTrack(event.track);
        }
        
        // Ensure audio element is ready to play
        console.log('🔊 Attempting to play remote audio...');
        // Make sure element is not muted and has correct attributes
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.volume = 1.0;
        
        const playPromise = remoteAudioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('✅ Remote audio playing successfully');
              console.log(`   Volume: ${remoteAudioRef.current.volume}`);
            })
            .catch(err => {
              console.error('❌ Error playing audio:', err);
              console.log('   Possible reasons: autoplay policy, muted tab, no audio data');
              console.log('   Trying to resume on user interaction...');
              // Store reference to try playing on user click
              window.__remoteAudioRef = remoteAudioRef.current;
            });
        }
      } else {
        console.error('❌ remoteAudioRef is null');
      }
    });

    // Handle connection state changes
    peerConnection.addEventListener('connectionstatechange', () => {
      console.log('🔌 Connection state:', peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'connected') {
        setCallStatus('connected');
      } else if (
        peerConnection.connectionState === 'disconnected' ||
        peerConnection.connectionState === 'failed' ||
        peerConnection.connectionState === 'closed'
      ) {
        endCall();
      }
    });

    // Monitor ICE connection state (critical for call establishment)
    peerConnection.addEventListener('iceconnectionstatechange', () => {
      console.log('❄️ ICE connection state:', peerConnection.iceConnectionState);
      console.log(`   Signaling state: ${peerConnection.signalingState}`);
      console.log(`   Connection state: ${peerConnection.connectionState}`);
      
      if (peerConnection.iceConnectionState === 'failed') {
        console.error('❌ ICE connection FAILED - no connection possible');
        console.error('   Possible causes:');
        console.error('   1. STUN/TURN servers unreachable');
        console.error('   2. Firewall blocking P2P');
        console.error('   3. No compatible ICE candidates');
      } else if (peerConnection.iceConnectionState === 'connected') {
        console.log('✅ ICE connection established');
      } else if (peerConnection.iceConnectionState === 'checking') {
        console.log('🔍 ICE candidates being checked...');
      }
    });

    // Monitor ICE gatherer state
    peerConnection.addEventListener('icegatheringstatechange', () => {
      console.log('🧊 ICE gathering state:', peerConnection.iceGatheringState);
    });

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, [remoteUser]);

  // Get local audio stream
  const getLocalStream = useCallback(async () => {
    try {
      if (localStreamRef.current) return localStreamRef.current;

      // Mobile-friendly audio constraints that adapt to device
      const isMobile = /iPhone|iPad|Android|webOS/i.test(navigator.userAgent);
      
      const audioConstraints = {
        audio: isMobile ? {
          // Mobile: more lenient constraints
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : {
          // Desktop: stricter quality
          echoCancellation: { exact: true },
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        },
        video: false
      };

      console.log(`📱 Requesting getUserMedia (mobile: ${isMobile})...`);
      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);

      console.log('🎤 Local audio stream obtained');
      console.log(`   Tracks: ${stream.getTracks().length}`);
      stream.getTracks().forEach((track, i) => {
        console.log(`   Track ${i}: ${track.kind}, enabled: ${track.enabled}, state: ${track.readyState}`);
      });
      
      localStreamRef.current = stream;

      // Add local audio tracks to peer connection
      const peerConnection = createPeerConnection();
      stream.getTracks().forEach((track) => {
        const sender = peerConnection.addTrack(track, stream);
        console.log(`✅ Added ${track.kind} track to peer connection`);
      });

      return stream;
    } catch (error) {
      console.error('❌ Error getting local stream:', error);
      const errorMsg = error.name === 'NotAllowedError' 
        ? 'Microphone permission denied. Please allow access.' 
        : error.name === 'NotFoundError' 
        ? 'No microphone found on this device.' 
        : error.message;
      console.error(`   Reason: ${errorMsg}`);
      setCallStatus('ended');
      throw error;
    }
  }, [createPeerConnection]);

  // Create offer (initiator)
  const createOffer = useCallback(async () => {
    try {
      await getLocalStream();
      const peerConnection = createPeerConnection();

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      await peerConnection.setLocalDescription(offer);

      console.log('📤 Offer created:', offer);
      setCallStatus('calling');

      return offer;
    } catch (error) {
      console.error('❌ Error creating offer:', error);
      setCallStatus('ended');
      throw error;
    }
  }, [getLocalStream, createPeerConnection]);

  // Create answer (receiver)
  const createAnswer = useCallback(async () => {
    try {
      // Get local stream and ensure it's added to peer connection
      await getLocalStream();
      
      const peerConnection = peerConnectionRef.current;
      
      if (!peerConnection) {
        console.error('❌ No peer connection available for answer');
        throw new Error('Peer connection not initialized');
      }

      // Verify remote description is set
      if (!peerConnection.remoteDescription) {
        console.error('❌ Remote description not set. Cannot create answer.');
        throw new Error('Remote description not set');
      }

      console.log('🔧 Creating answer with remote description set...');
      
      const answer = await peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      await peerConnection.setLocalDescription(answer);

      console.log('📥 Answer created:', answer);
      console.log('   Local description state:', peerConnection.signalingState);

      return answer;
    } catch (error) {
      console.error('❌ Error creating answer:', error);
      setCallStatus('ended');
      throw error;
    }
  }, [getLocalStream]);

  // Handle incoming offer
  const handleOffer = useCallback(async (offer, from) => {
    try {
      await getLocalStream();
      const peerConnection = createPeerConnection();

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      console.log('📨 Offer received from', from);
      setIncomingCall(true);
      setIncomingCaller(from);
      setCallStatus('ringing');
    } catch (error) {
      console.error('❌ Error handling offer:', error);
    }
  }, [getLocalStream, createPeerConnection]);

  // Handle incoming answer
  const handleAnswer = useCallback(async (answer) => {
    try {
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) {
        console.error('❌ No peer connection when handling answer');
        return;
      }

      console.log('📩 Answer received');
      console.log(`   Current signaling state: ${peerConnection.signalingState}`);
      console.log(`   Current ICE connection state: ${peerConnection.iceConnectionState}`);
      
      // Verify we have an offer pending
      if (peerConnection.signalingState !== 'have-local-offer') {
        console.warn(`⚠️ Unexpected signaling state: ${peerConnection.signalingState}`);
        console.warn('   Expected: have-local-offer');
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      
      console.log('✅ Remote description set (answer)');
      console.log(`   New signaling state: ${peerConnection.signalingState}`);
      console.log(`   ICE connection state: ${peerConnection.iceConnectionState}`);
      
      // START TIMER FOR CALLER when answer is received
      // The call is now established (caller has sent offer, receiver has sent answer)
      // Note: We need to start the timer here, but we use a direct reference to avoid circular dependency
      if (callStartTimeRef.current === null) {
        callStartTimeRef.current = Date.now();
        setCallDuration(0);
        
        timerIntervalRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
          setCallDuration(elapsed);
        }, 1000);

        // Start monitoring network quality
        monitorNetworkQuality();
        statsIntervalRef.current = setInterval(monitorNetworkQuality, 2000);
        
        console.log('⏱️ Call timer started (caller received answer)');
      }
    } catch (error) {
      console.error('❌ Error handling answer:', error);
      console.error('   Error message:', error.message);
    }
  }, [monitorNetworkQuality]);

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (candidate) => {
    try {
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) {
        console.error('❌ No peer connection for adding ICE candidate');
        return;
      }

      if (!candidate) {
        console.log('ℹ️ Null ICE candidate (gathering complete)');
        return;
      }

      console.log('❄️ Adding ICE candidate');
      console.log(`   Candidate: ${candidate.candidate?.substring(0, 50)}...`);
      console.log(`   Current ICE connection state: ${peerConnection.iceConnectionState}`);
      
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      
      console.log('✅ ICE candidate added successfully');
    } catch (error) {
      // Ignore errors for candidates that arrive before remote description
      if (error.code === 11 || error.name === 'InvalidStateError') {
        console.warn('⚠️ ICE candidate ignored (remote description not set yet)');
      } else {
        console.error('❌ Error adding ICE candidate:', error);
        console.error('   Error name:', error.name);
      }
    }
  }, []);

  // Mute/unmute local audio
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        if (track.kind === 'audio') {
          track.enabled = !track.enabled;
          console.log(`🔇 Audio ${track.enabled ? 'unmuted' : 'muted'}`);
        }
      });
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Toggle speaker
  const toggleSpeaker = useCallback(() => {
    if (remoteAudioRef.current) {
      const newSpeakerState = !speakerEnabled;
      remoteAudioRef.current.muted = !newSpeakerState;
      remoteAudioRef.current.volume = newSpeakerState ? 1.0 : 0;
      setSpeakerEnabled(newSpeakerState);
      console.log(`🔊 Speaker ${newSpeakerState ? 'on' : 'off'}`);
    }
  }, [speakerEnabled]);

  // Monitor network quality using RTCPeerConnection stats
  const monitorNetworkQuality = useCallback(() => {
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection) return;

    peerConnection.getStats().then((stats) => {
      let inboundRtpStats = null;
      let roundTripTime = null;
      let packetsLost = 0;
      let bytesSent = 0;

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          inboundRtpStats = report;
        } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          roundTripTime = report.currentRoundTripTime || 0;
        }
      });

      if (inboundRtpStats) {
        packetsLost = inboundRtpStats.packetsLost || 0;
        
        // Calculate packet loss percentage
        const totalPackets = inboundRtpStats.packetsReceived + packetsLost;
        const packetLossPercent = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
        
        // Determine network quality based on RTT and packet loss
        let quality = 'excellent';
        let warning = null;

        if (packetLossPercent > 5 || roundTripTime > 300) {
          quality = 'poor';
          warning = '⚠️ Poor network connection - audio may be affected';
        } else if (packetLossPercent > 2 || roundTripTime > 150) {
          quality = 'fair';
          warning = '⚠️ Network quality is fair';
        } else if (packetLossPercent > 1 || roundTripTime > 100) {
          quality = 'good';
        }

        setNetworkQuality(quality);
        
        // Show warning but don't disconnect
        if (warning && !networkWarning) {
          setNetworkWarning(warning);
          clearTimeout(networkWarningTimeoutRef.current);
          networkWarningTimeoutRef.current = setTimeout(() => {
            setNetworkWarning(null);
          }, 5000); // Hide warning after 5 seconds
        }

        console.log(`📊 Network Quality: ${quality} (RTT: ${roundTripTime?.toFixed(0)}ms, Loss: ${packetLossPercent.toFixed(1)}%)`);
      }
    });
  }, [networkWarning]);

  // Start call timer
  const startCallTimer = useCallback(() => {
    callStartTimeRef.current = Date.now();
    setCallDuration(0);
    
    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
      setCallDuration(elapsed);
    }, 1000);

    // Start monitoring network quality
    monitorNetworkQuality(); // First check immediately
    statsIntervalRef.current = setInterval(monitorNetworkQuality, 2000); // Then every 2 seconds
  }, [monitorNetworkQuality]);

  // Stop call timer
  const stopCallTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }
    if (networkWarningTimeoutRef.current) {
      clearTimeout(networkWarningTimeoutRef.current);
    }
  }, []);

  // Save call to history
  const saveCallHistory = useCallback(async (status = 'completed') => {
    try {
      const duration = callDuration;
      console.log(`💾 Saving call: ${currentUser} → ${remoteUser} (${duration}s, ${networkQuality})`);
      
      await callAPI.saveCall(
        currentUser,
        remoteUser,
        duration,
        status,
        networkQuality
      );
      
      console.log('✅ Call saved to history');
    } catch (error) {
      console.error('❌ Error saving call history:', error);
    }
  }, [callDuration, networkQuality, currentUser, remoteUser]);

  // Cleanup resources (defined before functions that use it)
  const cleanup = useCallback(() => {
    // Stop timers
    stopCallTimer();

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Clear remote audio
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    iceCandidatesRef.current = [];
  }, [stopCallTimer]);

  // Start call
  const startCall = useCallback(async () => {
    try {
      console.log(`📞 Starting call to ${remoteUser}...`);
      const offer = await createOffer();
      
      console.log('✅ Offer created, sending to remote user...');
      console.log(`   Peer connection state: ${peerConnectionRef.current?.signalingState}`);
      
      getSocket().emit('call-user', {
        to: remoteUser,
        from: currentUser,
        offer
      });
      
      console.log('📤 Call signal sent');
    } catch (error) {
      console.error('❌ Error starting call:', error);
      setCallStatus('ended');
    }
  }, [createOffer, remoteUser, currentUser]);

  // Accept call
  const acceptCall = useCallback(async () => {
    try {
      setIncomingCall(false);

      // Get the peer connection that already has remote description set
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) {
        console.error('❌ No peer connection for accepting call');
        return;
      }

      console.log('📋 Peer connection state before answer:');
      console.log(`   Signaling state: ${peerConnection.signalingState}`);
      console.log(`   Connection state: ${peerConnection.connectionState}`);
      console.log(`   ICE connection state: ${peerConnection.iceConnectionState}`);

      const answer = await createAnswer();
      
      console.log('✅ Answer created successfully');
      console.log('📋 Peer connection state after answer:');
      console.log(`   Signaling state: ${peerConnection.signalingState}`);

      setCallStatus('connected');
      startCallTimer(); // Start timer when call is accepted

      getSocket().emit('answer-call', {
        to: incomingCaller,
        from: currentUser,
        answer
      });

      console.log('📤 Answer sent to caller');
    } catch (error) {
      console.error('❌ Error accepting call:', error);
      console.error('   Error message:', error.message);
      setCallStatus('ended');
    }
  }, [createAnswer, incomingCaller, currentUser, startCallTimer]);

  // Reject call
  const rejectCall = useCallback(() => {
    setIncomingCall(false);
    setIncomingCaller(null);
    setCallStatus(null);

    getSocket().emit('end-call', {
      to: incomingCaller,
      from: currentUser,
      reason: 'rejected'
    });

    cleanup();
  }, [incomingCaller, currentUser]);

  // End call (local - will emit socket event)
  const endCall = useCallback(() => {
    setCallStatus('ended');
    setIncomingCall(false);

    stopCallTimer(); // Stop timer and network monitoring
    saveCallHistory('completed'); // Save call to history

    getSocket().emit('end-call', {
      to: remoteUser,
      from: currentUser
    });

    cleanup();

    // Reset after a delay
    setTimeout(() => {
      setCallStatus(null);
      setCallDuration(0);
      setNetworkWarning(null);
    }, 1000);
  }, [remoteUser, currentUser, stopCallTimer, saveCallHistory, cleanup]);

  // Handle remote end call (don't re-emit)
  const handleRemoteEndCall = useCallback(() => {
    setCallStatus('ended');
    setIncomingCall(false);
    stopCallTimer(); // Stop timer
    saveCallHistory('completed'); // Save call to history
    cleanup();

    // Reset after a delay
    setTimeout(() => {
      setCallStatus(null);
      setCallDuration(0);
      setNetworkWarning(null);
    }, 1000);
  }, [stopCallTimer, saveCallHistory, cleanup]);

  // Debug helper to diagnose audio issues
  const getAudioDebugInfo = useCallback(() => {
    const info = {
      audioElement: {
        exists: !!remoteAudioRef.current,
        muted: remoteAudioRef.current?.muted,
        volume: remoteAudioRef.current?.volume,
        paused: remoteAudioRef.current?.paused,
        readyState: remoteAudioRef.current?.readyState,
        networkState: remoteAudioRef.current?.networkState
      },
      stream: {
        hasSrcObject: !!remoteAudioRef.current?.srcObject,
        streamTracks: remoteAudioRef.current?.srcObject?.getTracks().length || 0,
        trackStates: remoteAudioRef.current?.srcObject?.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState
        })) || []
      },
      peerConnection: {
        exists: !!peerConnectionRef.current,
        connectionState: peerConnectionRef.current?.connectionState,
        iceConnectionState: peerConnectionRef.current?.iceConnectionState,
        signalingState: peerConnectionRef.current?.signalingState,
        iceGatheringState: peerConnectionRef.current?.iceGatheringState
      },
      callStatus
    };
    
    console.log('🔍 Audio Debug Info:', info);
    return info;
  }, [callStatus]);

  // Expose debug info globally for testing
  useEffect(() => {
    window.__webrtcDebug = {
      getAudioDebugInfo,
      remoteAudioRef,
      peerConnectionRef,
      localStreamRef
    };
    
    return () => {
      delete window.__webrtcDebug;
    };
  }, [getAudioDebugInfo]);

  return {
    callStatus,
    incomingCall,
    incomingCaller,
    remoteAudioRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    handleRemoteEndCall,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    cleanup,
    getAudioDebugInfo,
    // New features
    callDuration,
    isMuted,
    speakerEnabled,
    networkQuality,
    networkWarning,
    toggleMute,
    toggleSpeaker
  };
};
