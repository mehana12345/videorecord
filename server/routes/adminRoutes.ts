import { Router, Request, Response } from 'express';
import { queryAll, queryOne, execute } from '../db.ts';
import { authenticate, authorizeRole } from '../auth.ts';

const router = Router();

// Guard all admin routes
router.use(authenticate, authorizeRole(['admin']));

// Platform Statistics
router.get('/stats', (req: Request, res: Response) => {
  try {
    const studentCount = queryOne<any>('SELECT COUNT(*) as c FROM users WHERE role = "student"');
    const facultyCount = queryOne<any>('SELECT COUNT(*) as c FROM users WHERE role = "faculty"');
    const classCount = queryOne<any>('SELECT COUNT(*) as c FROM classes');
    const recordingCount = queryOne<any>('SELECT COUNT(*) as c FROM recordings');
    const liveSessionsCount = queryOne<any>('SELECT COUNT(*) as c FROM live_sessions');
    const activeLiveClasses = queryOne<any>('SELECT COUNT(*) as c FROM classes WHERE status = "live"');
    const pendingFacultyApprovals = queryOne<any>('SELECT COUNT(*) as c FROM users WHERE role = "faculty" AND status = "pending"');

    res.json({
      stats: {
        totalStudents: studentCount?.c || 0,
        totalFaculty: facultyCount?.c || 0,
        totalClasses: classCount?.c || 0,
        totalRecordings: recordingCount?.c || 0,
        totalLiveSessions: liveSessionsCount?.c || 0,
        activeLiveClasses: activeLiveClasses?.c || 0,
        pendingFacultyApprovals: pendingFacultyApprovals?.c || 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute platform stats' });
  }
});

// List all users
router.get('/users', (req: Request, res: Response) => {
  try {
    const { role, status } = req.query;
    let sql = 'SELECT id, name, email, role, status, avatar_url, created_at FROM users WHERE 1=1';
    const params: any[] = [];

    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';
    const users = queryAll<any>(sql, params);

    // Attach student or faculty metadata
    const augmented = users.map((u) => {
      let extra = null;
      if (u.role === 'student') {
        extra = queryOne('SELECT student_id, department, year FROM students WHERE user_id = ?', [u.id]);
      } else if (u.role === 'faculty') {
        extra = queryOne('SELECT faculty_id, department, subjects, designation FROM faculty WHERE user_id = ?', [u.id]);
      }
      return { ...u, details: extra };
    });

    res.json({ users: augmented });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Approve faculty account
router.patch('/faculty/:id/approve', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    execute("UPDATE users SET status = 'active' WHERE id = ? AND role = 'faculty'", [id]);
    execute(
      `INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, 'system')`,
      ['notif-app-' + Date.now(), id, 'Account Approved', 'Your faculty account has been approved by the administration. You can now schedule and host live classes.']
    );
    res.json({ message: 'Faculty account approved successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to approve faculty' });
  }
});

// Reject faculty account
router.patch('/faculty/:id/reject', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    execute("UPDATE users SET status = 'suspended' WHERE id = ? AND role = 'faculty'", [id]);
    res.json({ message: 'Faculty account rejected' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reject faculty' });
  }
});

// Delete user
router.delete('/users/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    execute('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User removed' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
