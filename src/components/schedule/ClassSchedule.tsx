import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  User,
  BookOpen,
  CheckCircle2,
  Play,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { ClassSession, Subject } from '../../types/index.ts';
import { api } from '../../services/api.ts';

interface ClassScheduleProps {
  onJoinLiveClass: (classId: string) => void;
  onWatchRecording: (recordingId: string) => void;
  onStartLiveClass?: (classSession: ClassSession) => void;
}

export const ClassSchedule: React.FC<ClassScheduleProps> = ({
  onJoinLiveClass,
  onWatchRecording,
  onStartLiveClass,
}) => {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSchedule();
  }, []);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const [clsRes, subjRes] = await Promise.all([
        api.getClasses(),
        api.getSubjects(),
      ]);
      setClasses(clsRes.classes);
      setSubjects(subjRes.subjects);
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const isFacultyOrAdmin = user?.role === 'faculty' || user?.role === 'admin';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-emerald-400" />
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Class Schedule & Timetable
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Weekly live lectures and academic timetable. Classes with active video will display the "Join Live" badge.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Filter Day:</span>
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Days</option>
            <option value="today">Today's Lectures</option>
            <option value="live">Live Now Only</option>
          </select>
        </div>
      </div>

      {/* Schedule Items */}
      {loading ? (
        <div className="py-20 text-center text-slate-500">
          <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs">Loading timetable...</p>
        </div>
      ) : classes.length === 0 ? (
        <div className="py-20 text-center rounded-2xl bg-slate-900/40 border border-slate-800 p-8 text-slate-500">
          No classes scheduled on this timetable.
        </div>
      ) : (
        <div className="space-y-4">
          {classes.map((cls) => (
            <div
              key={cls.id}
              className={`rounded-2xl border p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg ${
                cls.status === 'live'
                  ? 'bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border-emerald-500/50 ring-1 ring-emerald-500/30'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Left Details */}
              <div className="flex items-start gap-4">
                <div className="hidden sm:flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 text-center shrink-0">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    {new Date(cls.scheduledDate).toLocaleDateString([], { weekday: 'short' })}
                  </span>
                  <span className="text-base font-extrabold text-white">
                    {new Date(cls.scheduledDate).getDate()}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 text-xs font-semibold">
                      {cls.subjectCode} • {cls.subjectName}
                    </span>

                    {cls.status === 'live' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-500 text-white shadow-sm animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        LIVE NOW
                      </span>
                    )}

                    {cls.status === 'completed' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">
                        COMPLETED
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-white">{cls.title}</h3>
                  <p className="text-xs text-slate-400 line-clamp-1">{cls.description}</p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-1">
                    <span className="flex items-center gap-1 text-slate-300">
                      <User className="w-3.5 h-3.5 text-slate-500" />
                      {cls.facultyName}
                    </span>
                    <span className="flex items-center gap-1 text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      {cls.startTime} - {cls.endTime}
                    </span>
                    <span className="text-slate-500">
                      {cls.department} (Year {cls.year})
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Action */}
              <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                {cls.status === 'live' ? (
                  <button
                    onClick={() => onJoinLiveClass(cls.id)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                    JOIN LIVE CLASS
                  </button>
                ) : cls.status === 'scheduled' ? (
                  isFacultyOrAdmin && onStartLiveClass ? (
                    <button
                      onClick={() => onStartLiveClass(cls)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Start Class Now
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-800 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                      Available when Live • Starts at {cls.startTime}
                    </span>
                  )
                ) : (
                  <button
                    onClick={() => onWatchRecording(cls.id)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 text-amber-400 fill-current" />
                    Watch Recording
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
