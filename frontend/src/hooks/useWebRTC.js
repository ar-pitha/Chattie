import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../utils/socket';

const STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302'
];

export const useWebRTC = (currentUser, remoteUser) => {
  const [callStatus, setCallStatus] = useState(null); // null, 'calling', 'ringing', 'connected', 'ended'
  const [incomingCall, setIncomingCall] = useState(false);
  const [incomingCaller, setIncomingCaller] = useState(null);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const iceCandidatesRef = useRef([]);

  // Initialize RTCPeerConnection
  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const config = {
      iceServers: STUN_SERVERS.map(url => ({ urls: url }))
    };

    const peerConnection = new RTCPeerConnection(config);

    // Handle ICE candidates
    peerConnection.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        console.log('📡 ICE Candidate:', event.candidate);
        getSocket().emit('ice-candidate', {
          to: remoteUser,
          candidate: event.candidate
        });
      }
    });

    // Handle remote stream
    peerConnection.addEventListener('track', (event) => {
      console.log('🎵 Remote audio track received');
      console.log(`   Track kind: ${event.track.kind}`);
      console.log(`   Track state: ${event.track.readyState}`);
      console.log(`   Streams: ${event.streams.length}`);
      
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
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('📩 Answer received:', answer);
      }
    } catch (error) {
      console.error('❌ Error handling answer:', error);
    }
  }, []);

  // Handle ICE candidate
  const handleIceCandidate = useCallback(async (candidate) => {
    try {
      const peerConnection = peerConnectionRef.current;
      if (peerConnection && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('✅ ICE candidate added');
      }
    } catch (error) {
      console.error('❌ Error adding ICE candidate:', error);
    }
  }, []);

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
  }, [createAnswer, incomingCaller, currentUser]);

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

    getSocket().emit('end-call', {
      to: remoteUser,
      from: currentUser
    });

    cleanup();

    // Reset after a delay
    setTimeout(() => {
      setCallStatus(null);
    }, 1000);
  }, [remoteUser, currentUser]);

  // Handle remote end call (don't re-emit)
  const handleRemoteEndCall = useCallback(() => {
    setCallStatus('ended');
    setIncomingCall(false);
    cleanup();

    // Reset after a delay
    setTimeout(() => {
      setCallStatus(null);
    }, 1000);
  }, []);

  // Cleanup resources
  const cleanup = useCallback(() => {
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
  }, []);

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
    getAudioDebugInfo
  };
};
