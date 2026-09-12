export type UserRole = 'student' | 'faculty' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'pending' | 'suspended';
  avatarUrl?: string;
  createdAt: string;
  studentProfile?: StudentProfile;
  facultyProfile?: FacultyProfile;
}

export interface StudentProfile {
  studentId: string;
  department: string;
  year: number;
  semester?: number;
}

export interface FacultyProfile {
  facultyId: string;
  department: string;
  subjects: string[];
  designation?: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  department: string;
  semester: number;
  color: string;
  icon?: string;
  description?: string;
}

export interface ClassSession {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  facultyId: string;
  facultyName: string;
  facultyEmail: string;
  department: string;
  year: number;
  scheduledDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  maxParticipants: number;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  meetingRoomId: string;
  recordingId?: string;
  activeParticipantsCount?: number;
  createdAt: string;
}

export interface LiveSessionRecord {
  id: string;
  classId: string;
  facultyId: string;
  startedAt: string;
  endedAt?: string;
  isRecording: boolean;
  recordingId?: string;
}

export interface Recording {
  id: string;
  classId: string;
  title: string;
  subject: string;
  subjectCode?: string;
  facultyName: string;
  facultyId: string;
  department: string;
  durationSeconds: number;
  videoUrl: string;
  thumbnailUrl: string;
  fileSize: number;
  recordedAt: string;
  viewsCount: number;
  isWatched?: boolean;
  watchProgress?: number; // percentage 0-100
}

export interface ChatMessage {
  id: string;
  classId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  message: string;
  timestamp: string;
}

export interface ParticipantInfo {
  socketId: string;
  userId: string;
  name: string;
  role: UserRole;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  joinedAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'class_live' | 'upcoming_class' | 'recording_ready' | 'announcement' | 'system';
  read: boolean;
  link?: string;
  createdAt: string;
}

export interface StudyMaterial {
  id: string;
  classId: string;
  title: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  uploadedAt: string;
}

export interface PlatformStats {
  totalStudents: number;
  totalFaculty: number;
  totalClasses: number;
  totalRecordings: number;
  totalLiveSessions: number;
  activeLiveClasses: number;
  pendingFacultyApprovals: number;
}
