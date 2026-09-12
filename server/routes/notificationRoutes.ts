import { Router, Response } from 'express';
import { queryAll, execute } from '../db.ts';
import { authenticate, AuthenticatedRequest } from '../auth.ts';

const router = Router();

// GET notifications for current user
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const notifications = queryAll<any>(
      `SELECT id, user_id as userId, title, message, type, is_read as read, link, created_at as createdAt
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`,
      [userId]
    );

    res.json({
      notifications: notifications.map((n) => ({
        ...n,
        read: n.read === 1,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// MARK notification as read
router.patch('/:id/read', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    execute('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// MARK ALL notifications as read
router.post('/read-all', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// SEND ANNOUNCEMENT (Faculty/Admin broadcasts to department students)
router.post('/announce', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, message, department } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    let targetUsers: any[] = [];
    if (department && department !== 'all') {
      targetUsers = queryAll('SELECT user_id FROM students WHERE department = ?', [department]);
    } else {
      targetUsers = queryAll('SELECT id as user_id FROM users WHERE role = "student"');
    }

    targetUsers.forEach((u) => {
      execute(
        `INSERT INTO notifications (id, user_id, title, message, type, link) VALUES (?, ?, ?, ?, 'announcement', '/schedule')`,
        ['notif-ann-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6), u.user_id, title, message]
      );
    });

    res.json({ message: `Announcement sent to ${targetUsers.length} students` });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to send announcement' });
  }
});

export default router;
