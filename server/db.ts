import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import bcrypt from 'bcryptjs';

const DB_FILE_PATH = path.join(process.cwd(), 'liveclass.sqlite');

let dbInstance: SqlJsDatabase | null = null;

function saveDbToDisk() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE_PATH, buffer);
  } catch (err) {
    console.error('Error saving SQLite database to disk:', err);
  }
}

export async function getDatabase(): Promise<SqlJsDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await initSqlJs();
  let db: SqlJsDatabase;

  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE_PATH);
      db = new SQL.Database(fileBuffer);
      console.log('Loaded existing database from', DB_FILE_PATH);
    } catch (err) {
      console.warn('Could not read existing database file, creating fresh one:', err);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log('Created new in-memory SQLite database, will persist to', DB_FILE_PATH);
  }

  dbInstance = db;
  initSchemaAndSeed(db);
  saveDbToDisk();
  return dbInstance;
}

// Database query helpers
export function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function queryOne<T = any>(sql: string, params: any[] = []): T | null {
  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function execute(sql: string, params: any[] = []): void {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run(sql, params);
  saveDbToDisk();
}

function initSchemaAndSeed(db: SqlJsDatabase) {
  // Create tables with proper relational constraints, foreign keys, and indexes
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'faculty', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'pending', 'suspended')),
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      user_id TEXT PRIMARY KEY,
      student_id TEXT UNIQUE NOT NULL,
      department TEXT NOT NULL,
      year INTEGER NOT NULL,
      semester INTEGER DEFAULT 1,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS faculty (
      user_id TEXT PRIMARY KEY,
      faculty_id TEXT UNIQUE NOT NULL,
      department TEXT NOT NULL,
      subjects TEXT NOT NULL, -- JSON array string
      designation TEXT DEFAULT 'Assistant Professor',
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      semester INTEGER NOT NULL,
      color TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      subject_id TEXT NOT NULL,
      faculty_id TEXT NOT NULL,
      department TEXT NOT NULL,
      year INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      max_participants INTEGER DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'live', 'completed', 'cancelled')),
      meeting_room_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(subject_id) REFERENCES subjects(id),
      FOREIGN KEY(faculty_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS live_sessions (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      faculty_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      is_recording INTEGER DEFAULT 1,
      recording_id TEXT,
      FOREIGN KEY(class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      faculty_name TEXT NOT NULL,
      faculty_id TEXT NOT NULL,
      department TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      video_url TEXT NOT NULL,
      thumbnail_url TEXT,
      file_size INTEGER DEFAULT 0,
      recorded_at TEXT NOT NULL,
      views_count INTEGER DEFAULT 0,
      is_public INTEGER DEFAULT 1,
      FOREIGN KEY(class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS watch_history (
      user_id TEXT NOT NULL,
      recording_id TEXT NOT NULL,
      progress_percent INTEGER DEFAULT 0,
      is_completed INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, recording_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(recording_id) REFERENCES recordings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(class_id) REFERENCES classes(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      link TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS study_materials (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(class_id) REFERENCES classes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_classes_date ON classes(scheduled_date, status);
    CREATE INDEX IF NOT EXISTS idx_recordings_subject ON recordings(subject);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
  `);

  // Seed sample data if users table is empty
  const userCount = db.exec("SELECT COUNT(*) as count FROM users");
  const count = userCount[0]?.values[0]?.[0] as number;

  if (count === 0) {
    console.log('Seeding initial data into SQLite database...');
    seedDatabase(db);
  } else {
    // Ensure at least one live class is always available for immediate testing in deploy
    const liveCount = db.exec("SELECT COUNT(*) as count FROM classes WHERE status = 'live'");
    const activeLives = liveCount[0]?.values[0]?.[0] as number;
    if (activeLives === 0) {
      const today = new Date().toISOString().split('T')[0];
      const sched = db.exec("SELECT id FROM classes WHERE status = 'scheduled' LIMIT 1");
      const schedId = sched[0]?.values[0]?.[0] as string;
      if (schedId) {
        db.run(`UPDATE classes SET status = 'live', scheduled_date = '${today}' WHERE id = '${schedId}'`);
      } else {
        db.run(`UPDATE classes SET status = 'live', scheduled_date = '${today}' WHERE id = 'class-live-1'`);
      }
    }
  }
}

function seedDatabase(db: SqlJsDatabase) {
  const adminPasswordHash = bcrypt.hashSync('Admin@123', 10);
  const facultyPasswordHash = bcrypt.hashSync('Faculty@123', 10);
  const studentPasswordHash = bcrypt.hashSync('Student@123', 10);

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // 1. Users
  db.run(`
    INSERT INTO users (id, name, email, password_hash, role, status, avatar_url) VALUES
    ('user-admin-1', 'Dr. Alistair Vance', 'admin@liveclass.edu', '${adminPasswordHash}', 'admin', 'active', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'),
    ('user-faculty-1', 'Prof. Robert Smith', 'faculty.smith@liveclass.edu', '${facultyPasswordHash}', 'faculty', 'active', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80'),
    ('user-faculty-2', 'Dr. Sarah Jenkins', 'faculty.jenkins@liveclass.edu', '${facultyPasswordHash}', 'faculty', 'active', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80'),
    ('user-faculty-3', 'Prof. David Chen', 'faculty.chen@liveclass.edu', '${facultyPasswordHash}', 'faculty', 'pending', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80'),
    ('user-student-1', 'Alex Rivera', 'student.alex@liveclass.edu', '${studentPasswordHash}', 'student', 'active', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80'),
    ('user-student-2', 'Emma Watson', 'student.emma@liveclass.edu', '${studentPasswordHash}', 'student', 'active', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80');
  `);

  // 2. Student profiles
  db.run(`
    INSERT INTO students (user_id, student_id, department, year, semester) VALUES
    ('user-student-1', 'CS2023-042', 'Computer Science & Engineering', 3, 5),
    ('user-student-2', 'CS2024-118', 'Computer Science & Engineering', 2, 3);
  `);

  // 3. Faculty profiles
  db.run(`
    INSERT INTO faculty (user_id, faculty_id, department, subjects, designation) VALUES
    ('user-faculty-1', 'FAC-CS-101', 'Computer Science & Engineering', '["Data Structures & Algorithms", "Distributed Systems"]', 'Associate Professor'),
    ('user-faculty-2', 'FAC-AI-204', 'Artificial Intelligence & Data Science', '["Machine Learning & Neural Networks", "Natural Language Processing"]', 'Professor & Head of Dept'),
    ('user-faculty-3', 'FAC-EE-302', 'Electrical & Electronics', '["Digital Signal Processing", "Microcontrollers"]', 'Assistant Professor');
  `);

  // 4. Subjects
  db.run(`
    INSERT INTO subjects (id, code, name, department, semester, color, description) VALUES
    ('subj-1', 'CS301', 'Data Structures & Algorithms', 'Computer Science & Engineering', 5, '#4f46e5', 'Advanced algorithmic paradigms, graph traversal, and dynamic programming.'),
    ('subj-2', 'AI402', 'Machine Learning & Neural Networks', 'Artificial Intelligence & Data Science', 5, '#059669', 'Supervised learning, deep architectures, loss optimization, and transformers.'),
    ('subj-3', 'CS304', 'Distributed Systems & Cloud Architecture', 'Computer Science & Engineering', 5, '#0284c7', 'Consensus protocols, CAP theorem, WebRTC, microservices, and fault tolerance.'),
    ('subj-4', 'CS205', 'Database Management Systems', 'Computer Science & Engineering', 3, '#d97706', 'Relational design, ACID transactions, indexing, SQL queries, and normalization.');
  `);

  // 5. Classes (including one currently LIVE NOW for immediate testing)
  db.run(`
    INSERT INTO classes (id, title, description, subject_id, faculty_id, department, year, scheduled_date, start_time, end_time, max_participants, status, meeting_room_id) VALUES
    ('class-live-1', 'Graph Algorithms & Shortest Paths (Dijkstra, A*)', 'Live interactive coding walkthrough on weighted graphs, priority queues, and real-world road networks.', 'subj-1', 'user-faculty-1', 'Computer Science & Engineering', 3, '${today}', '10:00', '11:30', 120, 'live', 'room-cs301-live'),
    ('class-sched-2', 'Transformer Attention Mechanisms & BERT', 'Exploration of self-attention mechanisms, query-key-value matrices, and pre-trained LLM pipelines.', 'subj-2', 'user-faculty-2', 'Artificial Intelligence & Data Science', 3, '${today}', '14:00', '15:30', 80, 'scheduled', 'room-ai402-afternoon'),
    ('class-sched-3', 'WebRTC Signaling, STUN/TURN & Media Streams', 'Deep dive into peer-to-peer audio/video streaming, ICE candidate exchanges, and recording architectures.', 'subj-3', 'user-faculty-1', 'Computer Science & Engineering', 3, '${tomorrow}', '11:00', '12:30', 100, 'scheduled', 'room-cs304-tomorrow'),
    ('class-comp-4', 'B-Trees and High-Concurrency Indexing', 'Physical storage engines, write-ahead logging, and B-Tree balancing in modern database systems.', 'subj-4', 'user-faculty-1', 'Computer Science & Engineering', 2, '2026-09-10', '09:00', '10:30', 90, 'completed', 'room-cs205-past');
  `);

  // 6. Live Sessions
  db.run(`
    INSERT INTO live_sessions (id, class_id, faculty_id, started_at, is_recording) VALUES
    ('session-live-1', 'class-live-1', 'user-faculty-1', datetime('now', '-25 minutes'), 1);
  `);

  // 7. Recordings (real playable web-ready lecture videos with thumbnails)
  db.run(`
    INSERT INTO recordings (id, class_id, title, subject, faculty_name, faculty_id, department, duration_seconds, video_url, thumbnail_url, file_size, recorded_at, views_count) VALUES
    ('rec-1', 'class-comp-4', 'B-Trees and High-Concurrency Indexing', 'Database Management Systems', 'Prof. Robert Smith', 'user-faculty-1', 'Computer Science & Engineering', 3420, 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80', 254800000, '2026-09-10 10:35:00', 48),
    ('rec-2', 'class-live-1', 'Dynamic Programming Patterns: 0/1 Knapsack', 'Data Structures & Algorithms', 'Prof. Robert Smith', 'user-faculty-1', 'Computer Science & Engineering', 2850, 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80', 198000000, '2026-09-08 11:32:00', 92),
    ('rec-3', 'class-sched-2', 'Introduction to Deep Learning & PyTorch Tensors', 'Machine Learning & Neural Networks', 'Dr. Sarah Jenkins', 'user-faculty-2', 'Artificial Intelligence & Data Science', 3780, 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=600&auto=format&fit=crop&q=80', 312000000, '2026-09-06 15:45:00', 134);
  `);

  // 8. Notifications
  db.run(`
    INSERT INTO notifications (id, user_id, title, message, type, is_read, link) VALUES
    ('notif-1', 'user-student-1', 'Class Is Live Now!', 'Prof. Robert Smith has started "Graph Algorithms & Shortest Paths". Click to join immediately.', 'class_live', 0, '/classroom/class-live-1'),
    ('notif-2', 'user-student-1', 'New Lecture Recording Available', 'Recording for "B-Trees and High-Concurrency Indexing" has been processed and is ready to watch.', 'recording_ready', 0, '/recordings'),
    ('notif-3', 'user-faculty-1', 'Recording Saved Automatically', 'Your class "B-Trees and High-Concurrency Indexing" was successfully archived to cloud storage.', 'recording_ready', 1, '/recordings'),
    ('notif-4', 'user-admin-1', 'Faculty Registration Pending', 'Prof. David Chen has submitted credentials for faculty approval.', 'system', 0, '/admin');
  `);

  // 9. Study Materials
  db.run(`
    INSERT INTO study_materials (id, class_id, title, file_name, file_url, file_size) VALUES
    ('mat-1', 'class-live-1', 'Graph Algorithms Lecture Slides & Pseudocode', 'CS301_Lecture_09_Graphs.pdf', '#', 4250000),
    ('mat-2', 'class-comp-4', 'Database Indexing Benchmarks & Code Examples', 'CS205_BTrees_Benchmark.zip', '#', 1820000);
  `);
}
