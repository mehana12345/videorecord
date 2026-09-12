import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Video,
  Play,
  Calendar,
  Clock,
  BookOpen,
  Users,
  CheckCircle2,
  Film,
  Sparkles,
  ArrowRight,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { ClassSession, Recording, Subject } from '../../types/index.ts';
import { api } from '../../services/api.ts';

interface StudentDashboardProps {
  onJoinLiveClass: (classId: string) => void;
  onWatchRecording: (recordingId: string) => void;
  onNavigateTab: (tab: string) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  onJoinLiveClass,
  onWatchRecording,
  onNavigateTab,
}) => {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [recentRecordings, setRecentRecordings] = useState<Recording[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 20000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const [clsRes, recRes, subjRes] = await Promise.all([
        api.getClasses(),
        api.getRecordings({ userId: user?.id }),
        api.getSubjects(),
      ]);
      setClasses(clsRes.classes);
      setRecentRecordings(recRes.recordings.slice(0, 4));
      setSubjects(subjRes.subjects);
    } catch (err) {
      console.error('Failed to load student dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const liveClasses = classes.filter((c) => c.status === 'live');
  const upcomingClasses = classes.filter((c) => c.status === 'scheduled');

  const studentProfile = user?.studentProfile;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="relative rounded-3xl bg-gradient-to-r from-indigo-900/60 via-slate-900 to-slate-900 border border-indigo-500/20 p-6 sm:p-8 overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Student Academic Portal • Term 2026
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Welcome back, {user?.name}!
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              {studentProfile?.department || 'Computer Science & Engineering'} • Year {studentProfile?.year || '3'} (ID: {studentProfile?.studentId || 'CS2024-089'}).
              Join active live lectures with real-time video, or catch up on automatically recorded classes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigateTab('schedule')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-indigo-400" />
              View Timetable
            </button>
            <button
              onClick={() => onNavigateTab('recordings')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Film className="w-4 h-4" />
              Recorded Lectures ({recentRecordings.length})
            </button>
          </div>
        </div>
      </div>

      {/* ACTIVE LIVE CLASSES HERO SECTION */}
      {liveClasses.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                Live Right Now ({liveClasses.length})
              </h2>
            </div>
            <span className="text-xs text-rose-400 font-semibold bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
              Active Lecture in Progress
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveClasses.map((cls) => (
              <div
                key={cls.id}
                className="relative rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border-2 border-indigo-500/40 p-5 shadow-2xl flex flex-col justify-between group overflow-hidden"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        LIVE NOW
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-indigo-300 text-[11px] font-medium border border-slate-700">
                        {cls.subjectName}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
                      {cls.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{cls.description}</p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <p className="text-slate-300 font-medium">Faculty: {cls.facultyName}</p>
                    <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-indigo-400" />
                        Started at {cls.startTime}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-emerald-400" />
                        {cls.activeParticipantsCount || 1} in room
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => onJoinLiveClass(cls.id)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 group-hover:scale-105 transition-all cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                    JOIN LIVE CLASS
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Scheduled Classes & Timetable */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">Upcoming Scheduled Lectures</h2>
          </div>
          <button
            onClick={() => onNavigateTab('schedule')}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
          >
            Full Timetable <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {upcomingClasses.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-500 text-xs">
            No more scheduled classes today. Check the timetable for the rest of the week.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingClasses.map((cls) => (
              <div
                key={cls.id}
                className="rounded-2xl bg-slate-900 border border-slate-800 p-5 hover:border-slate-700 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-medium">
                      {cls.subjectCode}
                    </span>
                    <span className="text-slate-400 font-mono">{cls.scheduledDate}</span>
                  </div>

                  <h3 className="text-sm font-bold text-white">{cls.title}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{cls.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>{cls.facultyName}</span>
                  <span className="font-medium text-slate-200">
                    {cls.startTime} - {cls.endTime}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Auto-Recorded Lectures */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">Recent Class Recordings</h2>
          </div>
          <button
            onClick={() => onNavigateTab('recordings')}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
          >
            View All Recordings ({recentRecordings.length}) <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentRecordings.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-500 text-xs">
            No recordings uploaded yet. Recorded sessions will appear here automatically once faculty completes a class.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recentRecordings.map((rec) => (
              <div
                key={rec.id}
                onClick={() => onWatchRecording(rec.id)}
                className="group rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden cursor-pointer hover:border-amber-500/40 transition-all flex flex-col"
              >
                <div className="relative aspect-video bg-slate-950 overflow-hidden">
                  <img
                    src={rec.thumbnailUrl || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80'}
                    alt={rec.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80"
                  />
                  <div className="absolute inset-0 bg-slate-950/30 group-hover:bg-slate-950/10 flex items-center justify-center transition-colors">
                    <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <Play className="w-4 h-4 ml-0.5 fill-current" />
                    </div>
                  </div>
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">
                    {Math.floor(rec.durationSeconds / 60)}m {rec.durationSeconds % 60}s
                  </div>
                  {rec.isWatched && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-emerald-500 text-[9px] font-bold text-white flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      WATCHED
                    </div>
                  )}
                </div>

                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-semibold text-indigo-400">{rec.subject}</span>
                    <h3 className="text-xs font-bold text-white line-clamp-2 mt-0.5 group-hover:text-amber-400 transition-colors">
                      {rec.title}
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 truncate">{rec.facultyName}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Enrolled Subjects Cards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">My Enrolled Subjects</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((subj) => (
            <div
              key={subj.id}
              className="rounded-2xl bg-slate-900 border border-slate-800 p-4 hover:border-indigo-500/30 transition-colors flex items-start gap-4"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-md"
                style={{ backgroundColor: subj.color || '#4f46e5' }}
              >
                {subj.code.split(' ')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-slate-400 font-mono uppercase">{subj.code}</span>
                <h3 className="text-xs sm:text-sm font-bold text-white truncate">{subj.name}</h3>
                <p className="text-[11px] text-slate-400 mt-1">{subj.department}</p>
                <div className="flex items-center gap-2 text-[10px] text-indigo-300 mt-2">
                  <span>Attendance: 92%</span>
                  <span>•</span>
                  <span>4 Recordings Available</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
