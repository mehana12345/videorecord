import { io, Socket } from 'socket.io-client';
import { User, ParticipantInfo, ChatMessage } from '../types/index.ts';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export class LiveClassRTC {
  private socket: Socket | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private classId: string;
  private currentUser: User;

  // Event callbacks
  public onRemoteStream?: (socketId: string, stream: MediaStream, peerInfo: any) => void;
  public onPeerLeft?: (socketId: string) => void;
  public onParticipantsUpdate?: (participants: ParticipantInfo[]) => void;
  public onChatMessage?: (msg: ChatMessage) => void;
  public onClassEnded?: (data: { message: string }) => void;
  public onRecordingStateChange?: (isRecording: boolean, durationSeconds: number) => void;
  public onModerated?: (action: string) => void;

  private recordingStartTime: number = 0;
  private recordingInterval: any = null;

  constructor(classId: string, currentUser: User) {
    this.classId = classId;
    this.currentUser = currentUser;
  }

  /**
   * Acquire media stream: tries real webcam/mic first; if unavailable, generates a high-fidelity virtual stream
   */
  async initLocalMedia(preferScreen: boolean = false): Promise<MediaStream> {
    try {
      // First try real user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });
      this.localStream = stream;
      return stream;
    } catch (err) {
      console.warn('Physical camera/mic not accessible or blocked. Initializing virtual studio camera stream for testing:', err);
      // Generate realistic virtual stream with canvas & web audio API
      this.localStream = this.createVirtualStudioStream(this.currentUser.name, this.currentUser.role);
      return this.localStream;
    }
  }

  /**
   * Fallback virtual studio video stream generator
   */
  private createVirtualStudioStream(userName: string, userRole: string): MediaStream {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;

    let frame = 0;
    const draw = () => {
      frame++;
      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Studio grid lines
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Animated glowing orb / audio visualizer wave
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2 - 40;
      const radius = 110 + Math.sin(frame * 0.05) * 8;

      ctx.save();
      ctx.shadowBlur = 40;
      ctx.shadowColor = userRole === 'faculty' ? '#6366f1' : '#10b981';
      ctx.fillStyle = userRole === 'faculty' ? '#4f46e5' : '#059669';
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Avatar Initial
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 84px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initial = (userName[0] || 'U').toUpperCase();
      ctx.fillText(initial, centerX, centerY);

      // Audio waveform bars beneath avatar
      const numBars = 24;
      const barWidth = 10;
      const barSpacing = 8;
      const totalWaveWidth = numBars * (barWidth + barSpacing);
      const waveStartX = centerX - totalWaveWidth / 2;

      for (let i = 0; i < numBars; i++) {
        const barHeight = 15 + Math.abs(Math.sin(frame * 0.08 + i * 0.4)) * 45;
        const bx = waveStartX + i * (barWidth + barSpacing);
        const by = centerY + 140 - barHeight / 2;

        ctx.fillStyle = userRole === 'faculty' ? '#818cf8' : '#34d399';
        ctx.beginPath();
        ctx.roundRect(bx, by, barWidth, barHeight, 5);
        ctx.fill();
      }

      // Live Watermark and Name Overlay
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.beginPath();
      ctx.roundRect(40, canvas.height - 110, 480, 70, 16);
      ctx.fill();

      // Pulsing green dot
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(70, canvas.height - 75, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 24px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(userName, 95, canvas.height - 84);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px Plus Jakarta Sans, sans-serif';
      ctx.fillText(userRole.toUpperCase() + ' • LIVE FEED', 95, canvas.height - 60);

      // Timestamp at top right
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.beginPath();
      ctx.roundRect(canvas.width - 240, 40, 200, 44, 12);
      ctx.fill();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 16px monospace';
      ctx.textAlign = 'center';
      const nowStr = new Date().toTimeString().split(' ')[0];
      ctx.fillText(nowStr + ' UTC', canvas.width - 140, 62);

      requestAnimationFrame(draw);
    };

    draw();

    const videoStream = canvas.captureStream(30);

    // Create a silent audio track using Web Audio API to satisfy WebRTC audio transceivers
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.001; // subtle audible tone so visualizers react
    osc.connect(gain);
    const dest = audioCtx.createMediaStreamDestination();
    gain.connect(dest);
    osc.start();

    const audioTrack = dest.stream.getAudioTracks()[0];
    if (audioTrack) {
      videoStream.addTrack(audioTrack);
    }

    return videoStream;
  }

  /**
   * Connect to Socket.IO signaling server and join classroom room
   */
  connect(socketUrl: string = window.location.origin) {
    this.socket = io(socketUrl);

    this.socket.on('connect', () => {
      console.log('Connected to signaling server with socket ID:', this.socket?.id);
      this.socket?.emit('join-room', {
        classId: this.classId,
        user: {
          id: this.currentUser.id,
          name: this.currentUser.name,
          role: this.currentUser.role,
        },
      });
    });

    // Room participants list
    this.socket.on('room-users', ({ participants }: { participants: ParticipantInfo[] }) => {
      if (this.onParticipantsUpdate) {
        this.onParticipantsUpdate(participants);
      }
      // Create peer connections to existing users
      participants.forEach((p) => {
        if (p.socketId !== this.socket?.id) {
          this.initiatePeerConnection(p.socketId, true);
        }
      });
    });

    // New user joined
    this.socket.on('user-joined', ({ participant, socketId }) => {
      console.log('New peer joined room:', participant.name);
      // The newly joined user will initiate or wait for offers
    });

    // Handle SDP Offer
    this.socket.on('offer', async ({ senderSocketId, offer, senderInfo }) => {
      console.log('Received SDP offer from:', senderSocketId);
      const pc = this.getOrCreatePeerConnection(senderSocketId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket?.emit('answer', {
        targetSocketId: senderSocketId,
        answer,
      });
    });

    // Handle SDP Answer
    this.socket.on('answer', async ({ senderSocketId, answer }) => {
      console.log('Received SDP answer from:', senderSocketId);
      const pc = this.peerConnections.get(senderSocketId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    // Handle ICE Candidate
    this.socket.on('ice-candidate', async ({ senderSocketId, candidate }) => {
      const pc = this.peerConnections.get(senderSocketId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('Error adding ICE candidate:', e);
        }
      }
    });

    // Handle Peer Left
    this.socket.on('user-left', ({ socketId }) => {
      console.log('Peer left room:', socketId);
      this.closePeerConnection(socketId);
      if (this.onPeerLeft) {
        this.onPeerLeft(socketId);
      }
    });

    // Handle Live Chat
    this.socket.on('chat-message', (msg: ChatMessage) => {
      if (this.onChatMessage) {
        this.onChatMessage(msg);
      }
    });

    // Moderation events
    this.socket.on('force-mute', () => {
      this.toggleAudio(false);
      if (this.onModerated) {
        this.onModerated('You have been muted by faculty moderation.');
      }
    });

    this.socket.on('kicked-from-class', ({ reason }) => {
      if (this.onModerated) {
        this.onModerated(reason);
      }
    });

    // Class Ended by Faculty
    this.socket.on('class-ended', (data) => {
      if (this.onClassEnded) {
        this.onClassEnded(data);
      }
    });
  }

  /**
   * Initiate peer connection with another user
   */
  private initiatePeerConnection(targetSocketId: string, isInitiator: boolean) {
    const pc = this.getOrCreatePeerConnection(targetSocketId);

    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.socket?.emit('offer', {
            targetSocketId,
            offer,
            senderInfo: {
              userId: this.currentUser.id,
              name: this.currentUser.name,
              role: this.currentUser.role,
            },
          });
        } catch (err) {
          console.error('Error creating SDP offer:', err);
        }
      };
    }
  }

  private getOrCreatePeerConnection(targetSocketId: string): RTCPeerConnection {
    if (this.peerConnections.has(targetSocketId)) {
      return this.peerConnections.get(targetSocketId)!;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // ICE Candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket?.emit('ice-candidate', {
          targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    // Remote track received!
    pc.ontrack = (event) => {
      console.log('Received remote track from peer:', targetSocketId, event.track.kind);
      if (event.streams && event.streams[0]) {
        if (this.onRemoteStream) {
          this.onRemoteStream(targetSocketId, event.streams[0], {});
        }
      }
    };

    this.peerConnections.set(targetSocketId, pc);
    return pc;
  }

  private closePeerConnection(socketId: string) {
    const pc = this.peerConnections.get(socketId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(socketId);
    }
  }

  /**
   * Toggle local microphone
   */
  toggleAudio(enabled?: boolean): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = enabled !== undefined ? enabled : !audioTrack.enabled;
      this.socket?.emit('toggle-media', { isMuted: !audioTrack.enabled });
      return audioTrack.enabled;
    }
    return false;
  }

  /**
   * Toggle local camera
   */
  toggleVideo(enabled?: boolean): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = enabled !== undefined ? enabled : !videoTrack.enabled;
      this.socket?.emit('toggle-media', { isCameraOff: !videoTrack.enabled });
      return videoTrack.enabled;
    }
    return false;
  }

  /**
   * Screen sharing
   */
  async startScreenShare(): Promise<MediaStream | null> {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      this.screenStream = screenStream;

      const screenTrack = screenStream.getVideoTracks()[0];

      // Replace track on all active peer connections
      this.peerConnections.forEach((pc) => {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(screenTrack);
        }
      });

      this.socket?.emit('screen-share-changed', { isScreenSharing: true });

      // Handle screen sharing stopped by user in browser chrome
      screenTrack.onended = () => {
        this.stopScreenShare();
      };

      return screenStream;
    } catch (err) {
      console.warn('Screen share cancelled or failed:', err);
      return null;
    }
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }

    if (this.localStream) {
      const cameraTrack = this.localStream.getVideoTracks()[0];
      this.peerConnections.forEach((pc) => {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender && cameraTrack) {
          videoSender.replaceTrack(cameraTrack);
        }
      });
    }

    this.socket?.emit('screen-share-changed', { isScreenSharing: false });
  }

  /**
   * Send live chat message
   */
  sendChatMessage(message: string) {
    if (!this.socket || !message.trim()) return;
    this.socket.emit('send-chat', {
      classId: this.classId,
      message: message.trim(),
      user: {
        id: this.currentUser.id,
        name: this.currentUser.name,
        role: this.currentUser.role,
      },
    });
  }

  /**
   * Moderate student: mute or remove
   */
  muteStudent(targetSocketId: string) {
    this.socket?.emit('moderate-mute', { classId: this.classId, targetSocketId });
  }

  kickStudent(targetSocketId: string) {
    this.socket?.emit('moderate-kick', { classId: this.classId, targetSocketId });
  }

  /**
   * AUTOMATIC RECORDING PIPELINE
   * When faculty starts live session, automatically records audio/video
   */
  startRecording(): boolean {
    if (!this.localStream) {
      console.warn('Cannot start recording: localStream not initialized');
      return false;
    }

    try {
      this.recordedChunks = [];
      const streamToRecord = this.screenStream || this.localStream;

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';

      this.mediaRecorder = new MediaRecorder(streamToRecord, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); // 1-second chunks
      this.recordingStartTime = Date.now();

      if (this.recordingInterval) clearInterval(this.recordingInterval);
      this.recordingInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        if (this.onRecordingStateChange) {
          this.onRecordingStateChange(true, elapsed);
        }
      }, 1000);

      console.log('Automated recording successfully initiated with mimeType:', mimeType);
      return true;
    } catch (err) {
      console.error('Failed to start MediaRecorder:', err);
      return false;
    }
  }

  /**
   * Stops recording and returns final Blob and duration in seconds
   */
  async stopRecording(): Promise<{ blob: Blob; durationSeconds: number }> {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }

    const durationSeconds = Math.max(1, Math.floor((Date.now() - this.recordingStartTime) / 1000));

    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        const fallbackBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
        resolve({ blob: fallbackBlob, durationSeconds });
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, {
          type: this.mediaRecorder?.mimeType || 'video/webm',
        });
        console.log(`Recording completed. Total size: ${(blob.size / 1024 / 1024).toFixed(2)} MB, Duration: ${durationSeconds}s`);
        resolve({ blob, durationSeconds });
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Faculty ends class: broadcasts to all peers
   */
  endClass() {
    this.socket?.emit('class-ended-by-faculty', { classId: this.classId });
  }

  /**
   * Teardown and cleanup
   */
  leave() {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
    }
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    if (this.socket) {
      this.socket.emit('leave-room');
      this.socket.disconnect();
    }
  }
}
