import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Navbar } from './components/layout/Navbar.tsx';
import { StudentDashboard } from './components/dashboard/StudentDashboard.tsx';
import { FacultyDashboard } from './components/dashboard/FacultyDashboard.tsx';
import { AdminDashboard } from './components/dashboard/AdminDashboard.tsx';
import { LiveClassroom } from './components/classroom/LiveClassroom.tsx';
import { RecordedClasses } from './components/recordings/RecordedClasses.tsx';
import { ClassSchedule } from './components/schedule/ClassSchedule.tsx';
import { AuthModal } from './components/auth/AuthModal.tsx';
import { ClassSession } from './types/index.ts';
import { api } from './services/api.ts';

function MainApp() {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'schedule' | 'recordings' | 'admin'>('dashboard');
  const [activeLiveClass, setActiveLiveClass] = useState<ClassSession | null>(null);
  const [targetRecordingId, setTargetRecordingId] = useState<string | undefined>(undefined);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  const handleJoinLiveClass = async (classId: string) => {
    try {
      const res = await api.getClassById(classId);
      if (res.class.status === 'completed') {
        // If class is already completed, immediately route to its recording
        handleWatchRecording(res.class.recording?.id || res.class.id);
        return;
      }
      if (res.class.status !== 'live' && user?.role === 'student') {
        alert(`This class is not live right now (Status: ${res.class.status}). Only active live classes can be joined. When the instructor starts the lecture, it will be available to join.`);
        return;
      }
      setActiveLiveClass(res.class);
    } catch (err) {
      console.error('Failed to join live class:', err);
      alert('Could not join live classroom session.');
    }
  };

  const handleStartFacultyLiveClass = (classSession: ClassSession) => {
    setActiveLiveClass(classSession);
  };

  const handleWatchRecording = (recordingId: string) => {
    setTargetRecordingId(recordingId);
    setCurrentTab('recordings');
    setActiveLiveClass(null);
  };

  const handleClassEnded = (recordingId?: string) => {
    setActiveLiveClass(null);
    if (recordingId) {
      setTargetRecordingId(recordingId);
    }
    setCurrentTab('recordings');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Initializing LiveClass Portal...</p>
      </div>
    );
  }

  // When inside an active Google Meet-style live classroom
  if (activeLiveClass) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <Navbar
          currentTab="classroom"
          onSelectTab={(tab) => {
            if (window.confirm('Leave active live classroom session?')) {
              setActiveLiveClass(null);
              setCurrentTab(tab as any);
            }
          }}
          onOpenAuth={() => setShowAuthModal(true)}
          onJoinLiveClass={handleJoinLiveClass}
        />
        <LiveClassroom
          classSession={activeLiveClass}
          onLeave={() => setActiveLiveClass(null)}
          onClassCompleted={handleClassEnded}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Plus_Jakarta_Sans']">
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab as any);
          if (tab !== 'recordings') {
            setTargetRecordingId(undefined);
          }
        }}
        onOpenAuth={() => setShowAuthModal(true)}
        onJoinLiveClass={handleJoinLiveClass}
      />

      <main className="flex-1 pb-16">
        {currentTab === 'dashboard' && (
          <>
            {user?.role === 'student' && (
              <StudentDashboard
                onJoinLiveClass={handleJoinLiveClass}
                onWatchRecording={handleWatchRecording}
                onNavigateTab={(tab) => setCurrentTab(tab as any)}
              />
            )}
            {user?.role === 'faculty' && (
              <FacultyDashboard
                onStartLiveClass={handleStartFacultyLiveClass}
                onWatchRecording={handleWatchRecording}
                onNavigateTab={(tab) => setCurrentTab(tab as any)}
              />
            )}
            {user?.role === 'admin' && (
              <AdminDashboard
                onWatchRecording={handleWatchRecording}
                onJoinLiveClass={handleJoinLiveClass}
              />
            )}
            {!user && (
              <StudentDashboard
                onJoinLiveClass={handleJoinLiveClass}
                onWatchRecording={handleWatchRecording}
                onNavigateTab={(tab) => setCurrentTab(tab as any)}
              />
            )}
          </>
        )}

        {currentTab === 'schedule' && (
          <ClassSchedule
            onJoinLiveClass={handleJoinLiveClass}
            onWatchRecording={handleWatchRecording}
            onStartLiveClass={handleStartFacultyLiveClass}
          />
        )}

        {currentTab === 'recordings' && (
          <RecordedClasses initialRecordingId={targetRecordingId} />
        )}

        {currentTab === 'admin' && (
          <AdminDashboard
            onWatchRecording={handleWatchRecording}
            onJoinLiveClass={handleJoinLiveClass}
          />
        )}
      </main>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
