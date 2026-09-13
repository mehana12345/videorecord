import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Film,
  Search,
  Filter,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  CheckCircle2,
  Clock,
  Calendar,
  User,
  Trash2,
  Edit2,
  Download,
  X,
  BookOpen,
  Check,
  Eye,
} from 'lucide-react';
import { Recording, Subject } from '../../types/index.ts';
import { api } from '../../services/api.ts';

interface RecordedClassesProps {
  initialRecordingId?: string;
  onSelectRecording?: (recId: string) => void;
}

export const RecordedClasses: React.FC<RecordedClassesProps> = ({
  initialRecordingId,
}) => {
  const { user } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedDate, setSelectedDate] = useState('');
  const [filterWatched, setFilterWatched] = useState<'all' | 'watched' | 'unwatched'>('all');

  // Active video player modal state
  const [activeRecording, setActiveRecording] = useState<Recording | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);

  // Rename modal
  const [editingRecording, setEditingRecording] = useState<Recording | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<any>(null);

  useEffect(() => {
    loadData();
  }, [user?.id]);

  useEffect(() => {
    if (initialRecordingId && recordings.length > 0) {
      const found = recordings.find((r) => r.id === initialRecordingId || r.classId === initialRecordingId);
      if (found) {
        handleOpenPlayer(found);
      }
    }
  }, [initialRecordingId, recordings]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recRes, subjRes] = await Promise.all([
        api.getRecordings({ userId: user?.id }),
        api.getSubjects(),
      ]);
      setRecordings(recRes.recordings);
      setSubjects(subjRes.subjects);
    } catch (err) {
      console.error('Failed to load recordings data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPlayer = async (rec: Recording) => {
    setActiveRecording(rec);
    setIsPlaying(false);
    setCurrentTime(0);

    // Fetch refreshed details with views count update
    try {
      const { recording } = await api.getRecordingById(rec.id, user?.id);
      setActiveRecording(recording);
      setRecordings((prev) => prev.map((r) => (r.id === recording.id ? recording : r)));
    } catch (err) {
      console.warn(err);
    }
  };

  const handleClosePlayer = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setActiveRecording(null);
  };

  // Video playback controls
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    const dur = videoRef.current.duration || activeRecording?.durationSeconds || 1;
    setCurrentTime(curr);
    setDuration(dur);

    // Periodically save progress to backend
    const progress = Math.round((curr / dur) * 100);
    if (activeRecording && user && Math.floor(curr) % 5 === 0) {
      api.updateWatchProgress(activeRecording.id, progress, progress >= 90).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleSkip = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.currentTime + seconds, duration));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.volume = volume || 0.8;
      setIsMuted(false);
    } else {
      videoRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleToggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleMarkWatched = async (recordingId: string, currentStatus: boolean) => {
    try {
      await api.updateWatchProgress(recordingId, currentStatus ? 0 : 100, !currentStatus);
      setRecordings((prev) =>
        prev.map((r) => (r.id === recordingId ? { ...r, isWatched: !currentStatus, watchProgress: !currentStatus ? 100 : 0 } : r))
      );
      if (activeRecording?.id === recordingId) {
        setActiveRecording((prev) => prev ? { ...prev, isWatched: !currentStatus, watchProgress: !currentStatus ? 100 : 0 } : null);
      }
    } catch (err) {
      console.error('Failed to toggle watched status:', err);
    }
  };

  const handleDeleteRecording = async (recId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this lecture recording?')) return;
    try {
      await api.deleteRecording(recId);
      setRecordings((prev) => prev.filter((r) => r.id !== recId));
      if (activeRecording?.id === recId) {
        setActiveRecording(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveRename = async () => {
    if (!editingRecording || !newTitle.trim()) return;
    try {
      await api.renameRecording(editingRecording.id, newTitle.trim());
      setRecordings((prev) =>
        prev.map((r) => (r.id === editingRecording.id ? { ...r, title: newTitle.trim() } : r))
      );
      if (activeRecording?.id === editingRecording.id) {
        setActiveRecording((prev) => prev ? { ...prev, title: newTitle.trim() } : null);
      }
      setEditingRecording(null);
    } catch (err) {
      console.error(err);
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) {
      return `${hrs}:${(mins % 60).toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Filter recordings
  const filteredRecordings = recordings.filter((rec) => {
    const matchSearch =
      rec.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.facultyName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchSubject = selectedSubject === 'all' || rec.subject === selectedSubject;
    const matchDate = !selectedDate || rec.recordedAt.startsWith(selectedDate);
    const matchWatched =
      filterWatched === 'all' ||
      (filterWatched === 'watched' && rec.isWatched) ||
      (filterWatched === 'unwatched' && !rec.isWatched);

    return matchSearch && matchSubject && matchDate && matchWatched;
  });

  const isFacultyOrAdmin = user?.role === 'faculty' || user?.role === 'admin';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Film className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Recorded Classes</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Browse and watch automatically archived high-definition lecture recordings with seeking and speed controls.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-medium">
            Total Archives: <strong className="text-white">{recordings.length}</strong>
          </span>
          {user?.role === 'student' && (
            <span className="px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-medium">
              Watched: <strong className="text-white">{recordings.filter((r) => r.isWatched).length}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 shadow-sm">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search title, faculty, subject..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Subject Filter */}
        <div>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.name}>
                {s.code} – {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Filter */}
        <div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Watched Status Filter */}
        <div className="flex rounded-xl bg-slate-800 p-1 border border-slate-700">
          <button
            onClick={() => setFilterWatched('all')}
            className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-colors ${
              filterWatched === 'all' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterWatched('watched')}
            className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-colors ${
              filterWatched === 'watched' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Watched
          </button>
          <button
            onClick={() => setFilterWatched('unwatched')}
            className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-colors ${
              filterWatched === 'unwatched' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Pending
          </button>
        </div>
      </div>

      {/* Recordings Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-500">
          <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs">Loading recorded lectures...</p>
        </div>
      ) : filteredRecordings.length === 0 ? (
        <div className="py-20 text-center rounded-2xl bg-slate-900/40 border border-slate-800 p-8">
          <Film className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No recordings match your filter</h3>
          <p className="text-xs text-slate-500 mt-1">Try clearing filters or search terms.</p>
          {(searchTerm || selectedSubject !== 'all' || selectedDate || filterWatched !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedSubject('all');
                setSelectedDate('');
                setFilterWatched('all');
              }}
              className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecordings.map((rec) => (
            <div
              key={rec.id}
              className="group rounded-2xl bg-slate-900 border border-slate-800/80 hover:border-indigo-500/50 overflow-hidden shadow-lg hover:shadow-indigo-500/5 transition-all flex flex-col"
            >
              {/* Thumbnail Container */}
              <div
                onClick={() => handleOpenPlayer(rec)}
                className="relative aspect-video bg-slate-950 overflow-hidden cursor-pointer"
              >
                <img
                  src={rec.thumbnailUrl || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80'}
                  alt={rec.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-85"
                />

                {/* Dark overlay with Play icon */}
                <div className="absolute inset-0 bg-slate-950/40 group-hover:bg-slate-950/20 flex items-center justify-center transition-colors">
                  <div className="w-12 h-12 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 ml-0.5 fill-current" />
                  </div>
                </div>

                {/* Duration Badge */}
                <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-950/90 text-white text-[11px] font-mono font-medium flex items-center gap-1 border border-slate-800">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {formatSeconds(rec.durationSeconds)}
                </div>

                {/* Subject Badge */}
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-indigo-600/90 text-white text-[10px] font-semibold">
                  {rec.subject}
                </div>

                {/* Watched pill */}
                {rec.isWatched && (
                  <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-emerald-500/90 text-white text-[10px] font-bold flex items-center gap-1 shadow">
                    <CheckCircle2 className="w-3 h-3" />
                    WATCHED
                  </div>
                )}

                {/* Progress bar along bottom of thumbnail */}
                {rec.watchProgress && rec.watchProgress > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
                    <div
                      className="h-full bg-indigo-500 transition-all"
                      style={{ width: `${rec.watchProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h3
                    onClick={() => handleOpenPlayer(rec)}
                    className="font-bold text-sm text-slate-100 group-hover:text-indigo-400 transition-colors cursor-pointer line-clamp-2"
                  >
                    {rec.title}
                  </h3>

                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span className="truncate">{rec.facultyName}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>{new Date(rec.recordedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="w-3 h-3 text-slate-500" />
                      <span>{rec.viewsCount || 0} views</span>
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenPlayer(rec)}
                    className="flex-1 py-1.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Watch Lecture
                  </button>

                  <button
                    onClick={() => handleMarkWatched(rec.id, !!rec.isWatched)}
                    className={`p-2 rounded-xl transition-colors ${
                      rec.isWatched
                        ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                    title={rec.isWatched ? 'Mark as unwatched' : 'Mark as watched'}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>

                  {isFacultyOrAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingRecording(rec);
                          setNewTitle(rec.title);
                        }}
                        className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                        title="Rename Recording"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRecording(rec.id)}
                        className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete Recording"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* High-Fidelity Custom Video Player Modal */}
      {activeRecording && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-6 overflow-y-auto">
          <div
            ref={playerContainerRef}
            className="relative w-full max-w-5xl rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden flex flex-col my-auto"
          >
            {/* Player Top Bar */}
            <div className="h-12 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div className="truncate max-w-xl">
                <span className="text-[10px] font-bold uppercase text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded mr-2">
                  {activeRecording.subject}
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  {activeRecording.title}
                </span>
              </div>
              <button
                onClick={handleClosePlayer}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Canvas Container */}
            <div className="relative aspect-video bg-black flex items-center justify-center group">
              <video
                ref={videoRef}
                src={activeRecording.videoUrl}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => {
                  setIsPlaying(false);
                  handleMarkWatched(activeRecording.id, false);
                }}
                onClick={togglePlay}
                className="w-full h-full object-contain cursor-pointer"
              />

              {/* Big Center Play/Pause button on hover when paused */}
              {!isPlaying && (
                <div
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                >
                  <div className="w-16 h-16 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
                    <Play className="w-7 h-7 ml-1 fill-current" />
                  </div>
                </div>
              )}

              {/* Video Player Floating Control Bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 flex flex-col gap-2 transition-opacity duration-300">
                {/* Seekbar */}
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    step="0.1"
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* Controls Row */}
                <div className="flex items-center justify-between text-xs text-slate-200">
                  <div className="flex items-center gap-3">
                    {/* Play/Pause */}
                    <button
                      onClick={togglePlay}
                      className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white"
                    >
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                    </button>

                    {/* Skip 10s back / forward */}
                    <button
                      onClick={() => handleSkip(-10)}
                      className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-slate-300"
                      title="10s Back"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleSkip(10)}
                      className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-slate-300"
                      title="10s Forward"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>

                    {/* Volume Slider */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={toggleMute}
                        className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                      >
                        {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>

                    {/* Timecode */}
                    <span className="font-mono text-slate-300 text-[11px]">
                      {formatSeconds(currentTime)} / {formatSeconds(duration || activeRecording.durationSeconds)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Playback Speed Selector */}
                    <div className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-lg text-[11px]">
                      <span>Speed:</span>
                      <select
                        value={playbackRate}
                        onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                        className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
                      >
                        <option value="0.5" className="bg-slate-900">0.5x</option>
                        <option value="0.75" className="bg-slate-900">0.75x</option>
                        <option value="1" className="bg-slate-900">1.0x</option>
                        <option value="1.25" className="bg-slate-900">1.25x</option>
                        <option value="1.5" className="bg-slate-900">1.5x</option>
                        <option value="2" className="bg-slate-900">2.0x</option>
                      </select>
                    </div>

                    {/* Fullscreen */}
                    <button
                      onClick={handleToggleFullscreen}
                      className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                    >
                      <Maximize className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Info Footer */}
            <div className="p-4 sm:p-5 bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">{activeRecording.title}</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1">
                  <span>Faculty: <strong className="text-slate-200">{activeRecording.facultyName}</strong></span>
                  <span>Recorded: {new Date(activeRecording.recordedAt).toLocaleString()}</span>
                  <span>Views: {activeRecording.viewsCount}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleMarkWatched(activeRecording.id, !!activeRecording.isWatched)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    activeRecording.isWatched
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {activeRecording.isWatched ? 'Completed' : 'Mark Watched'}
                </button>

                <a
                  href={activeRecording.videoUrl}
                  download={`${activeRecording.title}.webm`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {editingRecording && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Rename Lecture Recording</h3>
            <p className="text-xs text-slate-400 mb-4">Update the display title of this recorded session for students.</p>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingRecording(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRename}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
