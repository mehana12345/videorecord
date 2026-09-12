import { Router, Request, Response } from 'express';
import multer from 'multer';
import { queryAll, queryOne, execute } from '../db.ts';
import { authenticate, authorizeRole, AuthenticatedRequest } from '../auth.ts';
import { StorageProvider } from '../storage.ts';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// GET all recordings with search & filtering
router.get('/', (req: Request, res: Response) => {
  try {
    const { search, subject, date, facultyId, userId } = req.query;

    let sql = `
      SELECT 
        r.id, r.class_id as classId, r.title, r.subject, r.faculty_name as facultyName,
        r.faculty_id as facultyId, r.department, r.duration_seconds as durationSeconds,
        r.video_url as videoUrl, r.thumbnail_url as thumbnailUrl, r.file_size as fileSize,
        r.recorded_at as recordedAt, r.views_count as viewsCount
      FROM recordings r
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      sql += ' AND (r.title LIKE ? OR r.subject LIKE ? OR r.faculty_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (subject && subject !== 'all') {
      sql += ' AND r.subject = ?';
      params.push(subject);
    }
    if (date) {
      sql += ' AND date(r.recorded_at) = ?';
      params.push(date);
    }
    if (facultyId) {
      sql += ' AND r.faculty_id = ?';
      params.push(facultyId);
    }

    sql += ' ORDER BY r.recorded_at DESC';

    const recordings = queryAll<any>(sql, params);

    // If userId provided, attach watch history
    const augmented = recordings.map((rec) => {
      let isWatched = false;
      let watchProgress = 0;
      if (userId) {
        const hist = queryOne<any>(
          'SELECT progress_percent, is_completed FROM watch_history WHERE user_id = ? AND recording_id = ?',
          [userId, rec.id]
        );
        if (hist) {
          isWatched = hist.is_completed === 1;
          watchProgress = hist.progress_percent;
        }
      }
      return {
        ...rec,
        isWatched,
        watchProgress,
      };
    });

    res.json({ recordings: augmented });
  } catch (err: any) {
    console.error('Error fetching recordings:', err);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

// GET single recording by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    const rec = queryOne<any>(
      `SELECT 
        r.id, r.class_id as classId, r.title, r.subject, r.faculty_name as facultyName,
        r.faculty_id as facultyId, r.department, r.duration_seconds as durationSeconds,
        r.video_url as videoUrl, r.thumbnail_url as thumbnailUrl, r.file_size as fileSize,
        r.recorded_at as recordedAt, r.views_count as viewsCount
      FROM recordings r WHERE r.id = ?`,
      [id]
    );

    if (!rec) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Increment views count
    execute('UPDATE recordings SET views_count = views_count + 1 WHERE id = ?', [id]);

    let isWatched = false;
    let watchProgress = 0;
    if (userId) {
      const hist = queryOne<any>(
        'SELECT progress_percent, is_completed FROM watch_history WHERE user_id = ? AND recording_id = ?',
        [userId, id]
      );
      if (hist) {
        isWatched = hist.is_completed === 1;
        watchProgress = hist.progress_percent;
      }
    }

    res.json({
      recording: {
        ...rec,
        viewsCount: rec.viewsCount + 1,
        isWatched,
        watchProgress,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch recording' });
  }
});

// UPLOAD RECORDING (MediaRecorder Blob upload from faculty client when ending class)
router.post('/upload', authenticate, upload.single('video'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { classId, title, durationSeconds } = req.body;
    const file = req.file;

    if (!classId) {
      return res.status(400).json({ error: 'classId is required' });
    }

    // Fetch class info
    const classInfo = queryOne<any>(
      `SELECT c.id, c.title, c.department, s.name as subjectName, u.name as facultyName, c.faculty_id as facultyId
       FROM classes c
       JOIN subjects s ON c.subject_id = s.id
       JOIN users u ON c.faculty_id = u.id
       WHERE c.id = ?`,
      [classId]
    );

    let recTitle = title || (classInfo ? classInfo.title : 'Live Session Recording');
    const subject = classInfo ? classInfo.subjectName : 'General';
    const facultyName = classInfo ? classInfo.facultyName : req.user!.name;
    const facultyId = classInfo ? classInfo.facultyId : req.user!.userId;
    const department = classInfo ? classInfo.department : 'General';
    const duration = parseInt(durationSeconds, 10) || 60;

    let videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    let fileSize = 0;

    // If real file uploaded by MediaRecorder, save to disk
    if (file && file.buffer) {
      const stored = await StorageProvider.saveRecordingFile(
        file.buffer,
        `${classId}.webm`,
        file.mimetype || 'video/webm'
      );
      videoUrl = stored.url;
      fileSize = stored.size;
    }

    const recId = 'rec-' + Date.now();
    const recordedAt = new Date().toISOString();
    const thumbnailUrl = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80';

    execute(
      `INSERT INTO recordings (
        id, class_id, title, subject, faculty_name, faculty_id, department,
        duration_seconds, video_url, thumbnail_url, file_size, recorded_at, views_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        recId,
        classId,
        recTitle,
        subject,
        facultyName,
        facultyId,
        department,
        duration,
        videoUrl,
        thumbnailUrl,
        fileSize,
        recordedAt,
      ]
    );

    // Update live_sessions with recording_id
    execute('UPDATE live_sessions SET recording_id = ? WHERE class_id = ?', [recId, classId]);

    // Send notifications to all students of the department
    const students = queryAll<any>('SELECT user_id FROM students WHERE department = ?', [department]);
    students.forEach((std) => {
      execute(
        `INSERT INTO notifications (id, user_id, title, message, type, link) VALUES (?, ?, ?, ?, 'recording_ready', ?)`,
        [
          'notif-rec-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          std.user_id,
          'Recorded Lecture Available: ' + recTitle,
          `The automatic recording for ${subject} is now available in your Recorded Classes archive.`,
          '/recordings',
        ]
      );
    });

    res.status(201).json({
      message: 'Recording saved and processed successfully',
      recordingId: recId,
      videoUrl,
    });
  } catch (err: any) {
    console.error('Upload recording error:', err);
    res.status(500).json({ error: 'Failed to upload and process recording' });
  }
});

// STREAM VIDEO with HTTP 206 Partial Content
router.get('/stream/:filename', (req: Request, res: Response) => {
  StorageProvider.streamVideo(req, res, req.params.filename);
});

// UPDATE / RENAME RECORDING (Faculty or Admin)
router.patch('/:id', authenticate, authorizeRole(['faculty', 'admin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const rec = queryOne<any>('SELECT faculty_id FROM recordings WHERE id = ?', [id]);
    if (!rec) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    if (req.user!.role !== 'admin' && rec.faculty_id !== req.user!.userId) {
      return res.status(403).json({ error: 'You do not have permission to modify this recording' });
    }

    execute('UPDATE recordings SET title = ? WHERE id = ?', [title, id]);

    res.json({ message: 'Recording updated successfully', title });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update recording' });
  }
});

// DELETE RECORDING (Faculty or Admin)
router.delete('/:id', authenticate, authorizeRole(['faculty', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const rec = queryOne<any>('SELECT faculty_id, video_url FROM recordings WHERE id = ?', [id]);

    if (!rec) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    if (req.user!.role !== 'admin' && rec.faculty_id !== req.user!.userId) {
      return res.status(403).json({ error: 'You do not have permission to delete this recording' });
    }

    // If local file, delete from disk
    if (rec.video_url && rec.video_url.includes('/api/recordings/stream/')) {
      const filename = rec.video_url.split('/').pop();
      if (filename) {
        await StorageProvider.deleteRecordingFile(filename);
      }
    }

    execute('DELETE FROM recordings WHERE id = ?', [id]);
    execute('DELETE FROM watch_history WHERE recording_id = ?', [id]);

    res.json({ message: 'Recording deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

// UPDATE WATCH PROGRESS
router.post('/:id/watch-progress', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { progressPercent, isCompleted } = req.body;
    const userId = req.user!.userId;

    const existing = queryOne('SELECT user_id FROM watch_history WHERE user_id = ? AND recording_id = ?', [userId, id]);

    if (existing) {
      execute(
        'UPDATE watch_history SET progress_percent = ?, is_completed = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND recording_id = ?',
        [progressPercent || 0, isCompleted ? 1 : 0, userId, id]
      );
    } else {
      execute(
        'INSERT INTO watch_history (user_id, recording_id, progress_percent, is_completed) VALUES (?, ?, ?, ?)',
        [userId, id, progressPercent || 0, isCompleted ? 1 : 0]
      );
    }

    res.json({ success: true, progressPercent, isCompleted });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update watch progress' });
  }
});

export default router;
