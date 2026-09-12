import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Video,
  Plus,
  Calendar,
  Clock,
  Users,
  Film,
  FileText,
  Bell,
  Trash2,
  Edit2,
  CheckCircle2,
  Play,
  ArrowRight,
  Upload,
  BookOpen,
  Share2,
} from 'lucide-react';
import { ClassSession, Recording, Subject } from '../../types/index.ts';
import { api } from '../../services/api.ts';

interface FacultyDashboardProps {
  onStartLiveClass: (classSession: ClassSession) => void;
  onWatchRecording: (recordingId: string) => void;
  onNavigateTab: (tab: string) => void;
}

export const FacultyDashboard: React.FC<FacultyDashboardProps> = ({
  onStartLiveClass,
  onWatchRecording,
  onNavigateTab,
}) => {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);

  // Schedule Form
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('10:00 AM');
  const [endTime, setEndTime] = useState('11:00 AM');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [year, setYear] = useState('3');
  const [maxParticipants, setMaxParticipants] = useState('60');

  // Material Form
  const [materialClassId, setMaterialClassId] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Announcement Form
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');

  useEffect(() => {
    loadFacultyData();
  }, []);

  const loadFacultyData = async () => {
    setLoading(true);
    try {
      const [clsRes, recRes, subjRes] = await Promise.all([
        api.getClasses(),
        api.getRecordings(),
        api.getSubjects(),
      ]);
      setClasses(clsRes.classes);
      setRecordings(recRes.recordings);
      setSubjects(subjRes.subjects);
      if (subjRes.subjects.length > 0) {
        setSubjectId(subjRes.subjects[0].id);
      }
      if (clsRes.classes.length > 0) {
        setMaterialClassId(clsRes.classes[0].id);
      }
    } catch (err) {
      console.error('Failed to load faculty dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createClass({
        title,
        description,
        subjectId,
        department,
        year: parseInt(year, 10),
        scheduledDate: date,
        startTime,
        endTime,
        maxParticipants: parseInt(maxParticipants, 10),
      });

      const res = await api.getClasses();
      setClasses(res.classes);
      setShowScheduleModal(false);
      setTitle('');
      setDescription('');
    } catch (err) {
      console.error('Failed to create class:', err);
      alert('Error creating class.');
    }
  };

  const handleStartInstantClass = async () => {
    try {
      const selectedSubj = subjects[0] || {
        id: 'subj-1',
        name: 'Data Structures & Algorithms',
        code: 'CS201',
      };
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const res = await api.createClass({
        title: `Live Interactive Lecture – ${selectedSubj.name}`,
        description: 'Instant live interactive classroom with automated cloud recording enabled.',
        subjectId: selectedSubj.id,
        department: 'Computer Science & Engineering',
        year: 3,
        scheduledDate: now.toISOString().split('T')[0],
        startTime: timeStr,
        endTime: '12:00 PM',
        maxParticipants: 100,
      });

      // Mark as live
      await api.startLiveClass(res.classId);
      const classDetails = await api.getClassById(res.classId);
      onStartLiveClass(classDetails.class);
    } catch (err) {
      console.error('Failed to start instant class:', err);
    }
  };

  const handleStartClassFromList = async (cls: ClassSession) => {
    try {
      await api.startLiveClass(cls.id);
      const updatedSession = { ...cls, status: 'live' as const };
      onStartLiveClass(updatedSession);
    } catch (err) {
      console.error('Failed to start class:', err);
    }
  };

  const handleUploadMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fileToUpload =
        selectedFile ||
        new File(['Lecture Notes & Syllabus References'], `${materialTitle}.pdf`, {
          type: 'application/pdf',
        });

      await api.uploadMaterial(materialClassId, materialTitle, fileToUpload);
      alert('Study material uploaded and attached to class successfully!');
      setShowMaterialModal(false);
      setMaterialTitle('');
      setSelectedFile(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.sendAnnouncement(announcementTitle, announcementMessage, department);
      alert('Announcement dispatched to students in your department!');
      setShowAnnouncementModal(false);
      setAnnouncementTitle('');
      setAnnouncementMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  const activeLiveCount = classes.filter((c) => c.status === 'live').length;
  const todayClassesCount = classes.filter(
    (c) => c.scheduledDate === new Date().toISOString().split('T')[0]
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Faculty Hero Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/50 to-slate-900 border border-indigo-500/20 p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
            <Video className="w-3.5 h-3.5" /> Faculty Lecture Hub • Auto-Recording Engine Active
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-2">
            Faculty Console – {user?.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            {user?.facultyProfile?.department || 'Department of Computer Science'}. Launch high-definition live classes
            with automatic browser recording, upload class syllabus, and manage archive records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleStartInstantClass}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Video className="w-4 h-4" />
            Start Instant Live Class
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Schedule Class
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Today's Classes</span>
            <Calendar className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{todayClassesCount}</p>
          <span className="text-[11px] text-slate-500">Scheduled on timetable</span>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Live Sessions</span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{activeLiveCount}</p>
          <span className="text-[11px] text-rose-400 font-medium">Currently streaming</span>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Lecture Recordings</span>
            <Film className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{recordings.length}</p>
          <span className="text-[11px] text-slate-500">Auto-archived to storage</span>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Students Enrolled</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">128</p>
          <span className="text-[11px] text-emerald-400">Across 3 departments</span>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <span className="text-xs text-slate-400 font-semibold mr-2">Faculty Tools:</span>
        <button
          onClick={() => setShowScheduleModal(true)}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
          Schedule Class
        </button>
        <button
          onClick={() => setShowMaterialModal(true)}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-emerald-400" />
          Upload Study Material
        </button>
        <button
          onClick={() => setShowAnnouncementModal(true)}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Bell className="w-3.5 h-3.5 text-amber-400" />
          Send Announcement
        </button>
      </div>

      {/* Classes Management Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight">Classes & Live Lectures</h2>
          <button
            onClick={() => onNavigateTab('schedule')}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
          >
            All Timetables <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Class / Subject</th>
                  <th className="px-5 py-3.5">Schedule</th>
                  <th className="px-5 py-3.5">Batch</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {classes.map((cls) => (
                  <tr key={cls.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-100 text-sm">{cls.title}</p>
                      <p className="text-[11px] text-indigo-400">
                        {cls.subjectCode} • {cls.subjectName}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      <p className="font-mono">{cls.scheduledDate}</p>
                      <p className="text-[11px] text-slate-500">
                        {cls.startTime} - {cls.endTime}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-400">
                      <p className="truncate max-w-[140px]">{cls.department}</p>
                      <p className="text-[11px] text-slate-500">Year {cls.year}</p>
                    </td>
                    <td className="px-5 py-4">
                      {cls.status === 'live' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          LIVE NOW
                        </span>
                      )}
                      {cls.status === 'scheduled' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          SCHEDULED
                        </span>
                      )}
                      {cls.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          COMPLETED
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {cls.status === 'live' ? (
                        <button
                          onClick={() => handleStartClassFromList(cls)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 flex items-center gap-1.5 ml-auto transition-all cursor-pointer"
                        >
                          <Video className="w-3.5 h-3.5" />
                          Resume Live
                        </button>
                      ) : cls.status === 'scheduled' ? (
                        <button
                          onClick={() => handleStartClassFromList(cls)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 flex items-center gap-1.5 ml-auto transition-all cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Start Live Class
                        </button>
                      ) : (
                        <button
                          onClick={() => onNavigateTab('recordings')}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center gap-1.5 ml-auto transition-colors cursor-pointer"
                        >
                          <Film className="w-3.5 h-3.5 text-amber-400" />
                          View Recording
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Schedule Class Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 my-8">
            <h3 className="text-lg font-bold text-white mb-1">Schedule New Live Lecture</h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter class specifications. An automatic recording will be generated when you conduct this session.
            </p>

            <form onSubmit={handleCreateClass} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Subject</label>
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} – {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Class Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Graph Algorithms & Shortest Paths"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description / Syllabus</label>
                <textarea
                  rows={2}
                  placeholder="Topics covered, prerequisite reading, code demos..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Start Time</label>
                  <input
                    type="text"
                    required
                    placeholder="10:00 AM"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">End Time</label>
                  <input
                    type="text"
                    required
                    placeholder="11:00 AM"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Academic Year</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="1">Year 1</option>
                    <option value="2">Year 2</option>
                    <option value="3">Year 3</option>
                    <option value="4">Year 4</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Max Participants</label>
                  <input
                    type="number"
                    value={maxParticipants}
                    onChange={(e) => setMaxParticipants(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  Schedule Lecture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Material Modal */}
      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Upload Study Material</h3>
            <p className="text-xs text-slate-400 mb-4">Attach slides, PDF notes or syllabus references for students.</p>
            <form onSubmit={handleUploadMaterial} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Associated Class</label>
                <select
                  value={materialClassId}
                  onChange={(e) => setMaterialClassId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.scheduledDate})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Document Title</label>
                <input
                  type="text"
                  required
                  placeholder="Lecture Slides - Topic Summary (PDF)"
                  value={materialTitle}
                  onChange={(e) => setMaterialTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Select File (Optional or auto-generates document)</label>
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowMaterialModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
                >
                  Save Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Announcement Modal */}
      {showAnnouncementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Send Class Announcement</h3>
            <p className="text-xs text-slate-400 mb-4">Dispatches an instant notification to all students in your classes.</p>
            <form onSubmit={handleSendAnnouncement} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Announcement Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Midterm Project Guidelines Released"
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Message</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Please review the uploaded slides before our next live session..."
                  value={announcementMessage}
                  onChange={(e) => setAnnouncementMessage(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAnnouncementModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white cursor-pointer"
                >
                  Send Broadcast
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
