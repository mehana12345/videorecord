import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Shield,
  Users,
  Film,
  Calendar,
  BookOpen,
  CheckCircle2,
  XCircle,
  Trash2,
  Plus,
  Search,
  HardDrive,
  Activity,
  UserCheck,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import { PlatformStats, User, Subject, Recording, ClassSession } from '../../types/index.ts';
import { api } from '../../services/api.ts';

interface AdminDashboardProps {
  onWatchRecording: (recordingId: string) => void;
  onJoinLiveClass: (classId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onWatchRecording,
  onJoinLiveClass,
}) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [pendingFaculty, setPendingFaculty] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allClasses, setAllClasses] = useState<ClassSession[]>([]);
  const [allRecordings, setAllRecordings] = useState<Recording[]>([]);

  // Sub-tabs: 'overview' | 'users' | 'classes' | 'recordings' | 'subjects'
  const [adminTab, setAdminTab] = useState<'overview' | 'users' | 'classes' | 'recordings' | 'subjects'>('overview');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');

  // Add Subject Modal
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [subjCode, setSubjCode] = useState('');
  const [subjName, setSubjName] = useState('');
  const [subjDept, setSubjDept] = useState('Computer Science & Engineering');
  const [subjColor, setSubjColor] = useState('#4f46e5');

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, subjRes, clsRes, recRes] = await Promise.all([
        api.getAdminStats(),
        api.getAdminUsers(),
        api.getSubjects(),
        api.getClasses(),
        api.getRecordings(),
      ]);

      setStats(statsRes.stats);
      setAllUsers(usersRes.users);
      setPendingFaculty(usersRes.users.filter((u) => u.role === 'faculty' && u.status === 'pending'));
      setSubjects(subjRes.subjects);
      setAllClasses(clsRes.classes);
      setAllRecordings(recRes.recordings);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveFaculty = async (userId: string, approved: boolean) => {
    try {
      if (approved) {
        await api.approveFaculty(userId);
      } else {
        await api.rejectFaculty(userId);
      }
      setPendingFaculty((prev) => prev.filter((u) => u.id !== userId));
      loadAdminData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.deleteUser(userId);
      setAllUsers((prev) => prev.filter((u) => u.id !== userId));
      loadAdminData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRecording = async (recId: string) => {
    if (!window.confirm('Are you sure you want to delete this recording from system storage?')) return;
    try {
      await api.deleteRecording(recId);
      setAllRecordings((prev) => prev.filter((r) => r.id !== recId));
      loadAdminData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createSubject({
        code: subjCode,
        name: subjName,
        department: subjDept,
        semester: 1,
        color: subjColor,
      });
      const updatedSubjs = await api.getSubjects();
      setSubjects(updatedSubjs.subjects);
      setShowAddSubject(false);
      setSubjCode('');
      setSubjName('');
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUsers = allUsers.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase());
    const matchRole = userRoleFilter === 'all' || u.role === userRoleFilter;
    return matchSearch && matchRole;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
            <Shield className="w-3.5 h-3.5" /> University Administrator Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-2">
            Campus Administration Console
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Control center for faculty approval, department subjects, live class sessions, video recording storage, and analytics.
          </p>
        </div>

        <button
          onClick={() => setShowAddSubject(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all self-start md:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add University Subject
        </button>
      </div>

      {/* Admin Statistics Row */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Total Students</span>
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-white mt-1">{stats.totalStudents}</p>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Total Faculty</span>
              <UserCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-white mt-1">{stats.totalFaculty}</p>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Live & Classes</span>
              <Calendar className="w-4 h-4 text-rose-400" />
            </div>
            <p className="text-2xl font-bold text-white mt-1">{stats.totalClasses}</p>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Recordings</span>
              <Film className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-white mt-1">{stats.totalRecordings}</p>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Live Active</span>
              <HardDrive className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-white mt-1">{stats.activeLiveClasses}</p>
          </div>
        </div>
      )}

      {/* Pending Faculty Approvals Banner */}
      {pendingFaculty.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
            <AlertTriangle className="w-4 h-4" />
            <span>Pending Faculty Approvals ({pendingFaculty.length})</span>
          </div>
          <p className="text-xs text-slate-300">
            The following faculty accounts have submitted registration and require administrative clearance to conduct live classes.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {pendingFaculty.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between bg-slate-900/80 p-3.5 rounded-xl border border-slate-800"
              >
                <div>
                  <p className="text-xs font-bold text-white">{f.name}</p>
                  <p className="text-[11px] text-slate-400">{f.email}</p>
                  <p className="text-[10px] text-indigo-400 mt-0.5">
                    {f.facultyProfile?.department} • ID: {f.facultyProfile?.facultyId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApproveFaculty(f.id, true)}
                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                    title="Approve Faculty"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleApproveFaculty(f.id, false)}
                    className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
                    title="Reject"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin Sub-Tabs Navigation */}
      <div className="flex rounded-2xl bg-slate-900 p-1.5 border border-slate-800 overflow-x-auto">
        <button
          onClick={() => setAdminTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
            adminTab === 'overview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          System Overview
        </button>
        <button
          onClick={() => setAdminTab('users')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
            adminTab === 'users' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          User Management ({allUsers.length})
        </button>
        <button
          onClick={() => setAdminTab('classes')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
            adminTab === 'classes' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Classes & Sessions ({allClasses.length})
        </button>
        <button
          onClick={() => setAdminTab('recordings')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
            adminTab === 'recordings' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Storage & Recordings ({allRecordings.length})
        </button>
        <button
          onClick={() => setAdminTab('subjects')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
            adminTab === 'subjects' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          University Subjects ({subjects.length})
        </button>
      </div>

      {/* TAB CONTENT: Overview */}
      {adminTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Live Classroom Activity Monitor
            </h3>
            <div className="divide-y divide-slate-800">
              {allClasses.filter((c) => c.status === 'live').length === 0 ? (
                <p className="text-xs text-slate-500 py-4">No live classrooms currently streaming.</p>
              ) : (
                allClasses
                  .filter((c) => c.status === 'live')
                  .map((cls) => (
                    <div key={cls.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-white">{cls.title}</p>
                        <p className="text-[10px] text-indigo-400">
                          {cls.facultyName} • {cls.subjectName}
                        </p>
                      </div>
                      <button
                        onClick={() => onJoinLiveClass(cls.id)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Join Live
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-indigo-400" />
              Media Storage & Infrastructure Health
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Disk Allocation</span>
                <span className="text-white font-mono">14.2 MB / 50 GB</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="w-1/12 h-full bg-indigo-500" />
              </div>
              <div className="flex justify-between text-slate-400 pt-2 border-t border-slate-800">
                <span>Database Engine</span>
                <span className="text-emerald-400 font-semibold">SQLite Disk Persistent (liveclass.sqlite)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>WebRTC Signaling Port</span>
                <span className="text-white font-mono">Port 3000 (Socket.IO Mesh)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Video Streaming Support</span>
                <span className="text-white">HTTP 206 Partial Content Range Requests</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Users */}
      {adminTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 bg-slate-900 p-3 rounded-2xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search user name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Roles</option>
              <option value="student">Students</option>
              <option value="faculty">Faculty</option>
              <option value="admin">Admins</option>
            </select>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">User</th>
                    <th className="px-5 py-3.5">Role</th>
                    <th className="px-5 py-3.5">Department / Details</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-slate-100">{u.name}</p>
                        <p className="text-[11px] text-slate-400">{u.email}</p>
                      </td>
                      <td className="px-5 py-3.5 capitalize font-semibold text-indigo-400">
                        {u.role}
                      </td>
                      <td className="px-5 py-3.5 text-slate-400">
                        {u.studentProfile && (
                          <p>
                            {u.studentProfile.department} (Year {u.studentProfile.year})
                          </p>
                        )}
                        {u.facultyProfile && <p>{u.facultyProfile.department}</p>}
                        {!u.studentProfile && !u.facultyProfile && <p>Campus Administration</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {u.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {u.id !== user?.id && (
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Delete User"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Classes */}
      {adminTab === 'classes' && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Title</th>
                  <th className="px-5 py-3.5">Faculty</th>
                  <th className="px-5 py-3.5">Subject</th>
                  <th className="px-5 py-3.5">Date & Time</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {allClasses.map((cls) => (
                  <tr key={cls.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-white">{cls.title}</td>
                    <td className="px-5 py-3.5 text-slate-300">{cls.facultyName}</td>
                    <td className="px-5 py-3.5 text-indigo-400">{cls.subjectName}</td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono">
                      {cls.scheduledDate} • {cls.startTime}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
                        {cls.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {cls.status === 'live' && (
                        <button
                          onClick={() => onJoinLiveClass(cls.id)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                        >
                          Join
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Recordings */}
      {adminTab === 'recordings' && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Recording Title</th>
                  <th className="px-5 py-3.5">Subject</th>
                  <th className="px-5 py-3.5">Faculty</th>
                  <th className="px-5 py-3.5">Duration</th>
                  <th className="px-5 py-3.5">Views</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {allRecordings.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-white">{rec.title}</td>
                    <td className="px-5 py-3.5 text-indigo-400">{rec.subject}</td>
                    <td className="px-5 py-3.5 text-slate-300">{rec.facultyName}</td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono">
                      {Math.floor(rec.durationSeconds / 60)}m {rec.durationSeconds % 60}s
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">{rec.viewsCount || 0}</td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      <button
                        onClick={() => onWatchRecording(rec.id)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                      >
                        Play
                      </button>
                      <button
                        onClick={() => handleDeleteRecording(rec.id)}
                        className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Delete Recording"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Subjects */}
      {adminTab === 'subjects' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((subj) => (
            <div
              key={subj.id}
              className="rounded-2xl bg-slate-900 border border-slate-800 p-5 flex items-start justify-between"
            >
              <div>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: subj.color || '#6366f1' }}
                >
                  {subj.code}
                </span>
                <h4 className="text-sm font-bold text-white mt-2">{subj.name}</h4>
                <p className="text-xs text-slate-400 mt-0.5">{subj.department}</p>
              </div>
              <BookOpen className="w-5 h-5 text-slate-600" />
            </div>
          ))}
        </div>
      )}

      {/* Add Subject Modal */}
      {showAddSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Add Academic Subject</h3>
            <p className="text-xs text-slate-400 mb-4">Add a new curriculum course for faculty and students.</p>
            <form onSubmit={handleCreateSubject} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Course Code</label>
                <input
                  type="text"
                  required
                  placeholder="CS402"
                  value={subjCode}
                  onChange={(e) => setSubjCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Subject Name</label>
                <input
                  type="text"
                  required
                  placeholder="Cloud Computing & Distributed Systems"
                  value={subjName}
                  onChange={(e) => setSubjName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Department</label>
                <select
                  value={subjDept}
                  onChange={(e) => setSubjDept(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Computer Science & Engineering">Computer Science & Engineering</option>
                  <option value="Artificial Intelligence & Data Science">Artificial Intelligence & Data Science</option>
                  <option value="Electrical & Electronics">Electrical & Electronics</option>
                  <option value="Mechanical Engineering">Mechanical Engineering</option>
                  <option value="Mathematics & Computing">Mathematics & Computing</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Color Theme</label>
                <input
                  type="color"
                  value={subjColor}
                  onChange={(e) => setSubjColor(e.target.value)}
                  className="w-full h-9 rounded-xl bg-slate-800 border border-slate-700 cursor-pointer p-1"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddSubject(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white cursor-pointer"
                >
                  Add Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
