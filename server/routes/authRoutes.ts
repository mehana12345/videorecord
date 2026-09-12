import { Router, Request, Response } from 'express';
import { queryOne, execute, queryAll } from '../db.ts';
import { generateToken, hashPassword, comparePassword, authenticate, AuthenticatedRequest } from '../auth.ts';

const router = Router();

// Student Registration
router.post('/register-student', (req: Request, res: Response) => {
  try {
    const { name, email, password, studentId, department, year } = req.body;

    if (!name || !email || !password || !studentId || !department) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const existingStudent = queryOne('SELECT user_id FROM students WHERE student_id = ?', [studentId]);
    if (existingStudent) {
      return res.status(400).json({ error: 'A student with this Student ID is already registered' });
    }

    const userId = 'user-std-' + Date.now();
    const passwordHash = hashPassword(password);
    const parsedYear = parseInt(year, 10) || 1;

    execute(
      `INSERT INTO users (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'student', 'active')`,
      [userId, name, email, passwordHash]
    );

    execute(
      `INSERT INTO students (user_id, student_id, department, year) VALUES (?, ?, ?, ?)`,
      [userId, studentId, department, parsedYear]
    );

    const token = generateToken({
      userId,
      email,
      role: 'student',
      name,
    });

    res.status(201).json({
      message: 'Student account registered successfully',
      token,
      user: {
        id: userId,
        name,
        email,
        role: 'student',
        status: 'active',
        studentProfile: {
          studentId,
          department,
          year: parsedYear,
        },
      },
    });
  } catch (err: any) {
    console.error('Student registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Faculty Registration (Subject to Admin Approval or auto-active for demo)
router.post('/register-faculty', (req: Request, res: Response) => {
  try {
    const { name, email, password, facultyId, department, subjects } = req.body;

    if (!name || !email || !password || !facultyId || !department) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const existingFaculty = queryOne('SELECT user_id FROM faculty WHERE faculty_id = ?', [facultyId]);
    if (existingFaculty) {
      return res.status(400).json({ error: 'A faculty member with this Faculty ID already exists' });
    }

    const userId = 'user-fac-' + Date.now();
    const passwordHash = hashPassword(password);
    const subjectsJson = JSON.stringify(Array.isArray(subjects) ? subjects : [subjects || 'General']);

    // Auto-active for smooth testing, but status column is tracked
    execute(
      `INSERT INTO users (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'faculty', 'active')`,
      [userId, name, email, passwordHash]
    );

    execute(
      `INSERT INTO faculty (user_id, faculty_id, department, subjects) VALUES (?, ?, ?, ?)`,
      [userId, facultyId, department, subjectsJson]
    );

    // Notify admin
    execute(
      `INSERT INTO notifications (id, user_id, title, message, type, link) VALUES (?, 'user-admin-1', ?, ?, 'system', '/admin')`,
      ['notif-fac-' + Date.now(), 'New Faculty Registration', `${name} (${department}) has registered as faculty.`]
    );

    const token = generateToken({
      userId,
      email,
      role: 'faculty',
      name,
    });

    res.status(201).json({
      message: 'Faculty account registered successfully',
      token,
      user: {
        id: userId,
        name,
        email,
        role: 'faculty',
        status: 'active',
        facultyProfile: {
          facultyId,
          department,
          subjects: typeof subjects === 'string' ? [subjects] : subjects,
        },
      },
    });
  } catch (err: any) {
    console.error('Faculty registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login
router.post('/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = queryOne<any>(
      `SELECT id, name, email, password_hash, role, status, avatar_url, created_at FROM users WHERE email = ?`,
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact administrator.' });
    }

    const isMatch = comparePassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    let studentProfile = null;
    let facultyProfile = null;

    if (user.role === 'student') {
      const student = queryOne<any>(`SELECT student_id, department, year, semester FROM students WHERE user_id = ?`, [user.id]);
      if (student) {
        studentProfile = {
          studentId: student.student_id,
          department: student.department,
          year: student.year,
          semester: student.semester,
        };
      }
    } else if (user.role === 'faculty') {
      const faculty = queryOne<any>(`SELECT faculty_id, department, subjects, designation FROM faculty WHERE user_id = ?`, [user.id]);
      if (faculty) {
        let subjectsList = [];
        try {
          subjectsList = JSON.parse(faculty.subjects);
        } catch {
          subjectsList = [faculty.subjects];
        }
        facultyProfile = {
          facultyId: faculty.faculty_id,
          department: faculty.department,
          subjects: subjectsList,
          designation: faculty.designation,
        };
      }
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        studentProfile,
        facultyProfile,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Forgot Password
router.post('/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const user = queryOne('SELECT id, name FROM users WHERE email = ?', [email]);
  if (!user) {
    return res.status(404).json({ error: 'No account found with this email' });
  }

  // Generate demo reset token
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
  res.json({
    message: 'Password reset code generated.',
    demoResetCode: resetCode,
    note: 'In production this is emailed. Use the code above to reset your password.',
  });
});

// Reset Password
router.post('/reset-password', (req: Request, res: Response) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: 'Email and new password are required' });
  }

  const user = queryOne('SELECT id FROM users WHERE email = ?', [email]);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const hash = hashPassword(newPassword);
  execute('UPDATE users SET password_hash = ? WHERE email = ?', [hash, email]);

  res.json({ message: 'Password has been successfully updated. You can now log in.' });
});

// Get Current User profile
router.get('/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = queryOne<any>(
      `SELECT id, name, email, role, status, avatar_url, created_at FROM users WHERE id = ?`,
      [req.user!.userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    let studentProfile = null;
    let facultyProfile = null;

    if (user.role === 'student') {
      const student = queryOne<any>(`SELECT student_id, department, year, semester FROM students WHERE user_id = ?`, [user.id]);
      if (student) {
        studentProfile = {
          studentId: student.student_id,
          department: student.department,
          year: student.year,
          semester: student.semester,
        };
      }
    } else if (user.role === 'faculty') {
      const faculty = queryOne<any>(`SELECT faculty_id, department, subjects, designation FROM faculty WHERE user_id = ?`, [user.id]);
      if (faculty) {
        let subjectsList = [];
        try {
          subjectsList = JSON.parse(faculty.subjects);
        } catch {
          subjectsList = [faculty.subjects];
        }
        facultyProfile = {
          facultyId: faculty.faculty_id,
          department: faculty.department,
          subjects: subjectsList,
          designation: faculty.designation,
        };
      }
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        studentProfile,
        facultyProfile,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve user profile' });
  }
});

export default router;
