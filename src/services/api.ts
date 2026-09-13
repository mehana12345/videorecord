import { ClassSession, Recording, Subject, User, NotificationItem, StudyMaterial, PlatformStats } from '../types/index.ts';

const API_BASE = '/api';

function getHeaders(isMultipart = false): HeadersInit {
  const token = localStorage.getItem('liveclass_token');
  const headers: Record<string, string> = {};
  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse(res);
  },

  async registerStudent(data: {
    name: string;
    email: string;
    password: string;
    studentId: string;
    department: string;
    year: number;
  }): Promise<{ token: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/register-student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async registerFaculty(data: {
    name: string;
    email: string;
    password: string;
    facultyId: string;
    department: string;
    subjects: string[];
  }): Promise<{ token: string; user: User }> {
    const res = await fetch(`${API_BASE}/auth/register-faculty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async getMe(): Promise<{ user: User }> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async forgotPassword(email: string): Promise<{ message: string; demoResetCode?: string }> {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return handleResponse(res);
  },

  async resetPassword(email: string, newPassword: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, newPassword }),
    });
    return handleResponse(res);
  },

  // Classes
  async getClasses(filters?: {
    department?: string;
    year?: number;
    status?: string;
    date?: string;
    facultyId?: string;
  }): Promise<{ classes: ClassSession[] }> {
    const query = new URLSearchParams();
    if (filters?.department) query.set('department', filters.department);
    if (filters?.year) query.set('year', filters.year.toString());
    if (filters?.status) query.set('status', filters.status);
    if (filters?.date) query.set('date', filters.date);
    if (filters?.facultyId) query.set('facultyId', filters.facultyId);

    const res = await fetch(`${API_BASE}/classes?${query.toString()}`, {
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async getClassById(id: string): Promise<{ class: ClassSession & { recording?: any; materials?: StudyMaterial[] } }> {
    const res = await fetch(`${API_BASE}/classes/${id}`, {
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async createClass(data: {
    title: string;
    description: string;
    subjectId: string;
    department: string;
    year: number;
    scheduledDate: string;
    startTime: string;
    endTime: string;
    maxParticipants: number;
  }): Promise<{ message: string; classId: string; meetingRoomId: string }> {
    const res = await fetch(`${API_BASE}/classes`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async startLiveClass(classId: string): Promise<{ message: string; sessionId: string; status: string }> {
    const res = await fetch(`${API_BASE}/classes/${classId}/start-live`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async endLiveClass(classId: string): Promise<{ message: string; status: string; recordingId?: string }> {
    const res = await fetch(`${API_BASE}/classes/${classId}/end-live`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async getClassChat(classId: string): Promise<{ messages: any[] }> {
    const res = await fetch(`${API_BASE}/classes/${classId}/chat`, {
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  // Recordings
  async getRecordings(filters?: {
    search?: string;
    subject?: string;
    date?: string;
    facultyId?: string;
    userId?: string;
  }): Promise<{ recordings: Recording[] }> {
    const query = new URLSearchParams();
    if (filters?.search) query.set('search', filters.search);
    if (filters?.subject) query.set('subject', filters.subject);
    if (filters?.date) query.set('date', filters.date);
    if (filters?.facultyId) query.set('facultyId', filters.facultyId);
    if (filters?.userId) query.set('userId', filters.userId);

    const res = await fetch(`${API_BASE}/recordings?${query.toString()}`, {
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async getRecordingById(id: string, userId?: string): Promise<{ recording: Recording }> {
    const query = userId ? `?userId=${userId}` : '';
    const res = await fetch(`${API_BASE}/recordings/${id}${query}`, {
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async uploadRecording(
    classId: string,
    videoBlob: Blob,
    durationSeconds: number,
    title?: string
  ): Promise<{ message: string; recordingId: string; videoUrl: string }> {
    const formData = new FormData();
    formData.append('classId', classId);
    formData.append('video', videoBlob, `${classId}.webm`);
    formData.append('durationSeconds', durationSeconds.toString());
    if (title) formData.append('title', title);

    const res = await fetch(`${API_BASE}/recordings/upload`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData,
    });
    return handleResponse(res);
  },

  async renameRecording(id: string, title: string): Promise<{ message: string; title: string }> {
    const res = await fetch(`${API_BASE}/recordings/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ title }),
    });
    return handleResponse(res);
  },

  async deleteRecording(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/recordings/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async updateWatchProgress(
    recordingId: string,
    progressPercent: number,
    isCompleted: boolean
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}/watch-progress`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ progressPercent, isCompleted }),
    });
    return handleResponse(res);
  },

  // Subjects
  async getSubjects(department?: string): Promise<{ subjects: Subject[] }> {
    const query = department ? `?department=${encodeURIComponent(department)}` : '';
    const res = await fetch(`${API_BASE}/subjects${query}`, {
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async createSubject(data: {
    code: string;
    name: string;
    department: string;
    semester: number;
    color: string;
    description?: string;
  }): Promise<{ message: string; id: string }> {
    const res = await fetch(`${API_BASE}/subjects`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteSubject(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/subjects/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  // Admin
  async getAdminStats(): Promise<{ stats: PlatformStats }> {
    const res = await fetch(`${API_BASE}/admin/stats`, {
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async getAdminUsers(role?: string, status?: string): Promise<{ users: User[] }> {
    const query = new URLSearchParams();
    if (role) query.set('role', role);
    if (status) query.set('status', status);
    const res = await fetch(`${API_BASE}/admin/users?${query.toString()}`, {
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async approveFaculty(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/admin/faculty/${id}/approve`, {
      method: 'PATCH',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async rejectFaculty(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/admin/faculty/${id}/reject`, {
      method: 'PATCH',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async deleteUser(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/admin/users/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  // Notifications
  async getNotifications(): Promise<{ notifications: NotificationItem[] }> {
    const res = await fetch(`${API_BASE}/notifications`, {
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async markNotificationRead(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async markAllNotificationsRead(): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/notifications/read-all`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async sendAnnouncement(title: string, message: string, department?: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/notifications/announce`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ title, message, department }),
    });
    return handleResponse(res);
  },

  // Materials
  async getClassMaterials(classId: string): Promise<{ materials: StudyMaterial[] }> {
    const res = await fetch(`${API_BASE}/materials/class/${classId}`, {
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async uploadMaterial(classId: string, title: string, file: File): Promise<{ message: string; material: StudyMaterial }> {
    const formData = new FormData();
    formData.append('classId', classId);
    formData.append('title', title);
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/materials/upload`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData,
    });
    return handleResponse(res);
  },
};
