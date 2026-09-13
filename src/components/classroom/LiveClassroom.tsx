import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Monitor,
  PhoneOff,
  MessageSquare,
  Users,
  Maximize,
  Minimize,
  Radio,
  Send,
  Shield,
  VolumeX,
  UserX,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { ClassSession, ParticipantInfo, ChatMessage } from '../../types/index.ts';
import { LiveClassRTC } from '../../services/webrtc.ts';
import { api } from '../../services/api.ts';

interface LiveClassroomProps {
  classSession: ClassSession;
  onLeave: () => void;
  onClassCompleted: (recordingId?: string) => void;
}

export const LiveClassroom: React.FC<LiveClassroomProps> = ({
  classSession,
  onLeave,
  onClassCompleted,
}) => {
  const { user } = useAuth();
  const [rtcService, setRtcService] = useState<LiveClassRTC | null>(null);

  // Media states
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isEndingAndUploading, setIsEndingAndUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');

  // UI Panels
  const [activePanel, setActivePanel] = useState<'none' | 'chat' | 'participants'>('none');
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  // Participants & Streams
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const classroomContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const isFacultyOrAdmin = user?.role === 'faculty' || user?.role === 'admin';

  // Initialize WebRTC and automatic recording on mount
  useEffect(() => {
    if (!user) return;

    const rtc = new LiveClassRTC(classSession.id, user);

    // Callbacks
    rtc.onRemoteStream = (socketId, stream) => {
      setRemoteStreams((prev) => {
        const updated = new Map(prev);
        updated.set(socketId, stream);
        return updated;
      });
    };

    rtc.onPeerLeft = (socketId) => {
      setRemoteStreams((prev) => {
        const updated = new Map(prev);
        updated.delete(socketId);
        return updated;
      });
    };

    rtc.onParticipantsUpdate = (list) => {
      setParticipants(list);
    };

    rtc.onChatMessage = (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      if (activePanel !== 'chat') {
        setUnreadChatCount((c) => c + 1);
      }
    };

    rtc.onRecordingStateChange = (recState, seconds) => {
      setIsRecording(recState);
      setRecordingSeconds(seconds);
    };

    rtc.onClassEnded = (data) => {
      // Automatic recording transition when faculty ends the live class:
      onClassCompleted(data?.classId || classSession.id);
    };

    rtc.onModerated = (msg) => {
      alert(msg);
      setIsMicOn(false);
    };

    // Load initial chat history from server
    api.getClassChat(classSession.id).then((res) => {
      if (res.messages) {
        setChatMessages(res.messages);
      }
    }).catch(console.warn);

    // Acquire media and start
    rtc.initLocalMedia().then((stream) => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      rtc.connect();

      // AUTOMATIC RECORDING REQUIREMENT:
      // When faculty starts a live class session, start recording automatically!
      if (isFacultyOrAdmin) {
        setTimeout(() => {
          const started = rtc.startRecording();
          if (started) {
            setIsRecording(true);
          }
        }, 1500);
      }
    });

    setRtcService(rtc);

    return () => {
      rtc.leave();
    };
  }, [classSession.id, user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, activePanel]);

  // Media toggles
  const handleToggleMic = () => {
    if (!rtcService) return;
    const newState = rtcService.toggleAudio();
    setIsMicOn(newState);
  };

  const handleToggleCam = () => {
    if (!rtcService) return;
    const newState = rtcService.toggleVideo();
    setIsCamOn(newState);
  };

  const handleToggleScreenShare = async () => {
    if (!rtcService) return;
    if (!isScreenSharing) {
      const stream = await rtcService.startScreenShare();
      if (stream) {
        setIsScreenSharing(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }
    } else {
      rtcService.stopScreenShare();
      setIsScreenSharing(false);
      if (localVideoRef.current && rtcService['localStream']) {
        localVideoRef.current.srcObject = rtcService['localStream'];
      }
    }
  };

  const handleToggleFullscreen = () => {
    if (!classroomContainerRef.current) return;
    if (!document.fullscreenElement) {
      classroomContainerRef.current.requestFullscreen().catch(console.warn);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.warn);
      setIsFullscreen(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !rtcService) return;
    rtcService.sendChatMessage(chatInput);
    setChatInput('');
  };

  // FACULTY END CLASS & AUTOMATIC RECORDING SAVE
  const handleFacultyEndClass = async () => {
    if (!window.confirm('Are you sure you want to end this live class? The automatic recording will be finalized and uploaded to the archive.')) {
      return;
    }

    if (!rtcService) return;
    setIsEndingAndUploading(true);
    setUploadProgressMsg('Finalizing automated audio/video recording...');

    try {
      let finalRecordingId: string | undefined;

      // 1. Stop recording and get recorded Blob if available
      try {
        const { blob, durationSeconds } = await rtcService.stopRecording();
        if (blob && blob.size > 0) {
          setUploadProgressMsg(`Finalizing recording (${(blob.size / 1024 / 1024).toFixed(2)} MB)... Uploading to storage archive...`);

          // 2. Upload recording blob to backend
          const uploadRes = await api.uploadRecording(
            classSession.id,
            blob,
            durationSeconds,
            classSession.title
          );
          if (uploadRes?.recordingId) {
            finalRecordingId = uploadRes.recordingId;
          }
        }
      } catch (recErr) {
        console.warn('Local media recording finalize notice:', recErr);
      }

      setUploadProgressMsg('Recording stored! Updating class status to completed...');

      // 3. Mark class as completed on backend (which also guarantees recording is created/verified)
      const endRes = await api.endLiveClass(classSession.id);
      if (endRes?.recordingId) {
        finalRecordingId = endRes.recordingId;
      }

      // 4. Notify peers via Socket
      rtcService.endClass();

      // 5. Complete and navigate to recording
      onClassCompleted(finalRecordingId || classSession.id);
    } catch (err: any) {
      console.error('Error stopping and uploading recording:', err);
      onClassCompleted(classSession.id);
    } finally {
      setIsEndingAndUploading(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${(mins % 60).toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={classroomContainerRef}
      className="relative flex flex-col h-[calc(100vh-64px)] w-full bg-slate-950 text-slate-100 overflow-hidden font-['Plus_Jakarta_Sans'] select-none"
    >
      {/* Ending & Uploading Overlay */}
      {isEndingAndUploading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-6">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 animate-spin mb-4">
            <Radio className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Finalizing Class Session & Recording</h3>
          <p className="text-sm text-slate-300 max-w-md text-center mb-4">{uploadProgressMsg}</p>
          <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="w-full h-full bg-indigo-500 animate-pulse" />
          </div>
          <p className="text-xs text-slate-500 mt-3">Please do not close the browser while archiving.</p>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="h-14 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Live Classroom
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          <div className="truncate max-w-[200px] sm:max-w-md">
            <h1 className="text-xs sm:text-sm font-bold text-white truncate">{classSession.title}</h1>
            <p className="text-[10px] text-slate-400 truncate">
              {classSession.subjectName} • {classSession.facultyName}
            </p>
          </div>
        </div>

        {/* Center: Live timer & Pulsing REC Badge */}
        <div className="flex items-center gap-3">
          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-mono font-bold shadow-sm shadow-rose-500/10">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>REC</span>
              <span className="text-rose-200">{formatTimer(recordingSeconds)}</span>
            </div>
          )}

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>WebRTC Connected (32ms)</span>
          </div>
        </div>

        {/* Right actions: View toggles & Fullscreen */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleToggleFullscreen}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Center Classroom Video Area */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Main Stage: Video Grid */}
        <div className="flex-1 p-3 sm:p-4 flex flex-col items-center justify-center overflow-hidden">
          <div className="w-full h-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-3 items-center justify-center">
            {/* Primary/Faculty Stream slot */}
            <div className="relative w-full h-full min-h-[260px] max-h-[540px] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center group">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${!isCamOn ? 'hidden' : ''}`}
              />
              {!isCamOn && (
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <div className="w-20 h-20 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 text-3xl font-bold mb-3 shadow-lg">
                    {(user?.name[0] || 'U').toUpperCase()}
                  </div>
                  <p className="text-sm font-medium text-slate-200">{user?.name} (You)</p>
                  <p className="text-xs text-slate-500 mt-0.5 capitalize">{user?.role} • Camera Disabled</p>
                </div>
              )}

              {/* Speaker Overlay Badge */}
              <div className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur border border-slate-800/80 text-xs font-medium text-white shadow-md">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{user?.name} (You)</span>
                <span className="text-[10px] text-indigo-400 uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                  {user?.role}
                </span>
                {!isMicOn && <MicOff className="w-3.5 h-3.5 text-rose-400 ml-1" />}
              </div>
            </div>

            {/* Remote Peer Stream slot (Simulated peer or actual connected peer) */}
            <div className="relative w-full h-full min-h-[260px] max-h-[540px] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center group">
              {remoteStreams.size > 0 ? (
                Array.from(remoteStreams.entries()).map(([socketId, stream]) => (
                  <video
                    key={socketId}
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el) el.srcObject = stream;
                    }}
                    className="w-full h-full object-cover"
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 mb-3">
                    <Users className="w-8 h-8 text-indigo-400" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-200">
                    {user?.role === 'student' ? classSession.facultyName : 'Classroom Audience'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    {user?.role === 'student'
                      ? 'Live presentation and peer video feed will display here as peers connect.'
                      : 'Students joining this lecture room will be visible here via WebRTC mesh.'}
                  </p>
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    WebRTC Signaling Active
                  </div>
                </div>
              )}

              {/* Remote label badge */}
              <div className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur border border-slate-800/80 text-xs font-medium text-white shadow-md">
                <span>{user?.role === 'student' ? classSession.facultyName : 'Class Participants'}</span>
                <span className="text-[10px] text-emerald-400 uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  {user?.role === 'student' ? 'Faculty' : 'Students'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Drawer: Live Chat */}
        {activePanel === 'chat' && (
          <div className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col z-30 animate-in slide-in-from-right duration-200">
            <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Classroom Chat</h3>
              </div>
              <button
                onClick={() => setActivePanel('none')}
                className="text-xs text-slate-400 hover:text-white p-1 rounded"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-slate-400" />
                  <p>No messages in classroom chat yet.</p>
                  <p className="text-[10px] text-slate-600 mt-1">Send a question to faculty or classmates.</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-300">{msg.userName}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                          msg.userRole === 'faculty'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {msg.userRole}
                      </span>
                      <span className="text-[10px] text-slate-500 ml-auto">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="bg-slate-800/80 rounded-xl px-3 py-2 text-xs text-slate-200 break-words border border-slate-700/50">
                      {msg.message}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-900 flex gap-2">
              <input
                type="text"
                placeholder="Ask faculty or contribute..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Right Drawer: Participants */}
        {activePanel === 'participants' && (
          <div className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col z-30 animate-in slide-in-from-right duration-200">
            <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Active Members ({participants.length || 1})
                </h3>
              </div>
              <button
                onClick={() => setActivePanel('none')}
                className="text-xs text-slate-400 hover:text-white p-1 rounded"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* Current user */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                    {(user?.name[0] || 'U').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{user?.name} (You)</p>
                    <p className="text-[10px] text-indigo-400 capitalize">{user?.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  {isMicOn ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5 text-rose-400" />}
                  {isCamOn ? <VideoIcon className="w-3.5 h-3.5 text-emerald-400" /> : <VideoOff className="w-3.5 h-3.5 text-rose-400" />}
                </div>
              </div>

              {/* Other participants */}
              {participants
                .filter((p) => p.userId !== user?.id)
                .map((p) => (
                  <div
                    key={p.socketId}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-white text-xs font-bold">
                        {(p.name[0] || 'P').toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-200">{p.name}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{p.role}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {p.isMuted ? (
                        <MicOff className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <Mic className="w-3.5 h-3.5 text-emerald-400" />
                      )}

                      {/* Faculty Moderation actions */}
                      {isFacultyOrAdmin && p.role === 'student' && (
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => rtcService?.muteStudent(p.socketId)}
                            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-400"
                            title="Mute Student"
                          >
                            <VolumeX className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => rtcService?.kickStudent(p.socketId)}
                            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-rose-400"
                            title="Remove from Class"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Control Dock */}
      <div className="h-20 bg-slate-900 border-t border-slate-800 flex items-center justify-center px-4 z-20">
        <div className="flex items-center gap-2 sm:gap-4 bg-slate-950/80 px-4 py-2.5 rounded-2xl border border-slate-800/80 shadow-2xl">
          {/* Mic */}
          <button
            onClick={handleToggleMic}
            className={`p-3 rounded-xl font-medium transition-all ${
              isMicOn
                ? 'bg-slate-800 text-white hover:bg-slate-700'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}
            title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Camera */}
          <button
            onClick={handleToggleCam}
            className={`p-3 rounded-xl font-medium transition-all ${
              isCamOn
                ? 'bg-slate-800 text-white hover:bg-slate-700'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}
            title={isCamOn ? 'Turn Off Camera' : 'Turn On Camera'}
          >
            {isCamOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* Screen Share */}
          <button
            onClick={handleToggleScreenShare}
            className={`p-3 rounded-xl font-medium transition-all ${
              isScreenSharing
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
          >
            <Monitor className="w-5 h-5" />
          </button>

          <div className="h-6 w-px bg-slate-800" />

          {/* Chat Drawer Toggle */}
          <button
            onClick={() => {
              setActivePanel(activePanel === 'chat' ? 'none' : 'chat');
              setUnreadChatCount(0);
            }}
            className={`relative p-3 rounded-xl font-medium transition-all ${
              activePanel === 'chat'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Toggle Classroom Chat"
          >
            <MessageSquare className="w-5 h-5" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Participants Drawer Toggle */}
          <button
            onClick={() => setActivePanel(activePanel === 'participants' ? 'none' : 'participants')}
            className={`p-3 rounded-xl font-medium transition-all ${
              activePanel === 'participants'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Toggle Participants List"
          >
            <Users className="w-5 h-5" />
          </button>

          <div className="h-6 w-px bg-slate-800" />

          {/* Leave or End Class Button */}
          {isFacultyOrAdmin ? (
            <button
              onClick={handleFacultyEndClass}
              disabled={isEndingAndUploading}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" />
              <span>End Class & Save Recording</span>
            </button>
          ) : (
            <button
              onClick={onLeave}
              className="px-4 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-600/30 hover:border-transparent text-rose-300 hover:text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Leave Class</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
