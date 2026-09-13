import { Router, Request, Response } from 'express';
import { queryAll, queryOne, execute } from '../db.ts';
import { authenticate, authorizeRole, AuthenticatedRequest } from '../auth.ts';
import { getRoomParticipantCount } from '../sockets.ts';

const router = Router();

// GET all classes with optional filters
router.get('/', (req: Request, res: Response) => {
  try {
    const { department, year, status, date, facultyId } = req.query;

    let sql = `
      SELECT 
        c.id, c.title, c.description, c.subject_id as subjectId, s.name as subjectName, s.code as subjectCode,
        c.faculty_id as facultyId, u.name as facultyName, u.email as facultyEmail,
        c.department, c.year, c.scheduled_date as scheduledDate, c.start_time as startTime, c.end_time as endTime,
        c.max_participants as maxParticipants, c.status, c.meeting_room_id as meetingRoomId, c.created_at as createdAt
      FROM classes c
      JOIN subjects s ON c.subject_id = s.id
      JOIN users u ON c.faculty_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (department) {
      sql += ' AND c.department = ?';
      params.push(department);
    }
    if (year) {
      sql += ' AND c.year = ?';
      params.push(parseInt(year as string, 10));
    }
    if (status) {
      sql += ' AND c.status = ?';
      params.push(status);
    }
    if (date) {
      sql += ' AND c.scheduled_date = ?';
      params.push(date);
    }
    if (facultyId) {
      sql += ' AND c.faculty_id = ?';
      params.push(facultyId);
    }

    sql += ' ORDER BY c.scheduled_date ASC, c.start_time ASC';

    const classes = queryAll<any>(sql, params);

    // Attach active participants count for live classes
    const augmented = classes.map((c) => ({
      ...c,
      activeParticipantsCount: c.status === 'live' ? getRoomParticipantCount(c.id) : 0,
    }));

    res.json({ classes: augmented });
  } catch (err: any) {
    console.error('Error fetching classes:', err);
    res.status(500).json({ error: 'Failed to retrieve classes' });
  }
});

// GET single class by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = queryOne<any>(
      `SELECT 
        c.id, c.title, c.description, c.subject_id as subjectId, s.name as subjectName, s.code as subjectCode,
        c.faculty_id as facultyId, u.name as facultyName, u.email as facultyEmail,
        c.department, c.year, c.scheduled_date as scheduledDate, c.start_time as startTime, c.end_time as endTime,
        c.max_participants as maxParticipants, c.status, c.meeting_room_id as meetingRoomId, c.created_at as createdAt
      FROM classes c
      JOIN subjects s ON c.subject_id = s.id
      JOIN users u ON c.faculty_id = u.id
      WHERE c.id = ?`,
      [id]
    );

    if (!item) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const recording = queryOne<any>(`SELECT id, video_url, duration_seconds FROM recordings WHERE class_id = ?`, [id]);
    const materials = queryAll<any>(`SELECT id, title, file_name, file_url, file_size FROM study_materials WHERE class_id = ?`, [id]);

    res.json({
      class: {
        ...item,
        activeParticipantsCount: item.status === 'live' ? getRoomParticipantCount(item.id) : 0,
        recording,
        materials,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch class details' });
  }
});

// CREATE a new class (Faculty or Admin)
router.post('/', authenticate, authorizeRole(['faculty', 'admin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      title,
      description,
      subjectId,
      department,
      year,
      scheduledDate,
      startTime,
      endTime,
      maxParticipants,
    } = req.body;

    if (!title || !subjectId || !department || !scheduledDate || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required class creation fields' });
    }

    const classId = 'cls-' + Date.now();
    const facultyId = req.user!.userId;
    const meetingRoomId = 'room-' + Math.random().toString(36).substring(2, 10);
    const parsedYear = parseInt(year, 10) || 1;
    const parsedMax = parseInt(maxParticipants, 10) || 100;

    execute(
      `INSERT INTO classes (
        id, title, description, subject_id, faculty_id, department, year,
        scheduled_date, start_time, end_time, max_participants, status, meeting_room_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`,
      [
        classId,
        title,
        description || '',
        subjectId,
        facultyId,
        department,
        parsedYear,
        scheduledDate,
        startTime,
        endTime,
        parsedMax,
        meetingRoomId,
      ]
    );

    // Notify students of new scheduled class
    const students = queryAll<any>('SELECT user_id FROM students WHERE department = ?', [department]);
    students.forEach((std) => {
      execute(
        `INSERT INTO notifications (id, user_id, title, message, type, link) VALUES (?, ?, ?, ?, 'upcoming_class', ?)`,
        [
          'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          std.user_id,
          'New Class Scheduled: ' + title,
          `Class scheduled for ${scheduledDate} from ${startTime} to ${endTime}`,
          `/classroom/${classId}`,
        ]
      );
    });

    res.status(201).json({
      message: 'Class scheduled successfully',
      classId,
      meetingRoomId,
    });
  } catch (err: any) {
    console.error('Create class error:', err);
    res.status(500).json({ error: 'Failed to create class' });
  }
});

// START LIVE CLASS (Faculty only)
router.post('/:id/start-live', authenticate, authorizeRole(['faculty', 'admin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const classItem = queryOne<any>('SELECT * FROM classes WHERE id = ?', [id]);

    if (!classItem) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Update status to live
    execute("UPDATE classes SET status = 'live' WHERE id = ?", [id]);

    const sessionId = 'session-' + Date.now();
    execute(
      `INSERT INTO live_sessions (id, class_id, faculty_id, started_at, is_recording) VALUES (?, ?, ?, datetime('now'), 1)`,
      [sessionId, id, req.user!.userId]
    );

    // Broadcast notifications to students
    const students = queryAll<any>('SELECT user_id FROM students WHERE department = ?', [classItem.department]);
    students.forEach((std) => {
      execute(
        `INSERT INTO notifications (id, user_id, title, message, type, link) VALUES (?, ?, ?, ?, 'class_live', ?)`,
        [
          'notif-live-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          std.user_id,
          '🔴 LIVE NOW: ' + classItem.title,
          `Your live class has just started. Click to join the live session immediately.`,
          `/classroom/${id}`,
        ]
      );
    });

    res.json({
      message: 'Live session started successfully',
      sessionId,
      status: 'live',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to start live class' });
  }
});

// END LIVE CLASS (Faculty only)
router.post('/:id/end-live', authenticate, authorizeRole(['faculty', 'admin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    execute("UPDATE classes SET status = 'completed' WHERE id = ?", [id]);
    execute("UPDATE live_sessions SET ended_at = datetime('now') WHERE class_id = ? AND ended_at IS NULL", [id]);

    // Check if recording already created for this class
    const existingRec = queryOne<any>('SELECT id FROM recordings WHERE class_id = ?', [id]);
    let recordingId = existingRec?.id;

    if (!existingRec) {
      // Find class details
      const classItem = queryOne<any>(
        `SELECT c.id, c.title, c.department, s.name as subjectName, u.name as facultyName, c.faculty_id as facultyId,
                ls.started_at as sessionStartedAt
         FROM classes c
         JOIN subjects s ON c.subject_id = s.id
         JOIN users u ON c.faculty_id = u.id
         LEFT JOIN live_sessions ls ON ls.class_id = c.id
         WHERE c.id = ?`,
        [id]
      );

      if (classItem) {
        recordingId = 'rec-' + Date.now();
        let durationSeconds = 1800; // default 30 mins
        if (classItem.sessionStartedAt) {
          const startMs = new Date(classItem.sessionStartedAt).getTime();
          const diffSec = Math.floor((Date.now() - startMs) / 1000);
          if (diffSec > 10 && diffSec < 36000) {
            durationSeconds = diffSec;
          }
        }

        const videoSampleUrls = [
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
        ];
        const videoUrl = videoSampleUrls[Math.floor(Math.random() * videoSampleUrls.length)];
        const thumbnailUrl = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80';

        execute(
          `INSERT INTO recordings (
            id, class_id, title, subject, faculty_name, faculty_id, department,
            duration_seconds, video_url, thumbnail_url, file_size, recorded_at, views_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 0)`,
          [
            recordingId,
            id,
            classItem.title,
            classItem.subjectName,
            classItem.facultyName,
            classItem.facultyId,
            classItem.department,
            durationSeconds,
            videoUrl,
            thumbnailUrl,
            128000000
          ]
        );

        execute('UPDATE live_sessions SET recording_id = ? WHERE class_id = ?', [recordingId, id]);

        // Send notifications to students that recording is ready
        const students = queryAll<any>('SELECT user_id FROM students WHERE department = ?', [classItem.department]);
        students.forEach((std) => {
          execute(
            `INSERT INTO notifications (id, user_id, title, message, type, link) VALUES (?, ?, ?, ?, 'recording_ready', ?)`,
            [
              'notif-rec-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
              std.user_id,
              'Class Recording Ready: ' + classItem.title,
              `The live lecture for "${classItem.title}" has concluded and the recording is now available to watch.`,
              `/recordings`,
            ]
          );
        });
      }
    }

    res.json({
      message: 'Live class completed successfully and recording archived',
      status: 'completed',
      recordingId,
    });
  } catch (err: any) {
    console.error('Error ending live class:', err);
    res.status(500).json({ error: 'Failed to end live class' });
  }
});

// GET CHAT HISTORY for a class
router.get('/:id/chat', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const messages = queryAll<any>(
      `SELECT id, class_id as classId, user_id as userId, user_name as userName, user_role as userRole, message, timestamp
       FROM chat_messages WHERE class_id = ? ORDER BY timestamp ASC`,
      [id]
    );
    res.json({ messages });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve chat history' });
  }
});

export default router;
