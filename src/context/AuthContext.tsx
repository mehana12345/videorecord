import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types/index.ts';
import { api } from '../services/api.ts';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerStudent: (data: any) => Promise<void>;
  registerFaculty: (data: any) => Promise<void>;
  logout: () => void;
  quickSwitchRole: (role: UserRole) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('liveclass_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const initAuth = async () => {
    const savedToken = localStorage.getItem('liveclass_token');
    if (savedToken) {
      try {
        const { user } = await api.getMe();
        setUser(user);
        setToken(savedToken);
      } catch (err) {
        console.warn('Session expired or invalid, auto-logging in demo student:', err);
        // Fallback to student demo for instant pleasant preview
        await quickSwitchRole('student');
      }
    } else {
      // Default to student demo on first visit so preview is active immediately!
      await quickSwitchRole('student');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(email, password);
      localStorage.setItem('liveclass_token', res.token);
      setToken(res.token);
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  };

  const registerStudent = async (data: any) => {
    setIsLoading(true);
    try {
      const res = await api.registerStudent(data);
      localStorage.setItem('liveclass_token', res.token);
      setToken(res.token);
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  };

  const registerFaculty = async (data: any) => {
    setIsLoading(true);
    try {
      const res = await api.registerFaculty(data);
      localStorage.setItem('liveclass_token', res.token);
      setToken(res.token);
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('liveclass_token');
    setToken(null);
    setUser(null);
  };

  const quickSwitchRole = async (role: UserRole) => {
    setIsLoading(true);
    try {
      let email = 'student.alex@liveclass.edu';
      let password = 'Student@123';

      if (role === 'faculty') {
        email = 'faculty.smith@liveclass.edu';
        password = 'Faculty@123';
      } else if (role === 'admin') {
        email = 'admin@liveclass.edu';
        password = 'Admin@123';
      }

      const res = await api.login(email, password);
      localStorage.setItem('liveclass_token', res.token);
      setToken(res.token);
      setUser(res.user);
    } catch (err) {
      console.error('Quick switch role failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const { user } = await api.getMe();
      setUser(user);
    } catch (err) {
      console.error('Refresh user error:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        registerStudent,
        registerFaculty,
        logout,
        quickSwitchRole,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
