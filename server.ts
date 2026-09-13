import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { getDatabase } from './server/db.ts';
import { setupSocketIO } from './server/sockets.ts';

// Route handlers
import authRoutes from './server/routes/authRoutes.ts';
import classRoutes from './server/routes/classRoutes.ts';
import recordingRoutes from './server/routes/recordingRoutes.ts';
import adminRoutes from './server/routes/adminRoutes.ts';
import subjectRoutes from './server/routes/subjectRoutes.ts';
import notificationRoutes from './server/routes/notificationRoutes.ts';
import materialRoutes from './server/routes/materialRoutes.ts';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  // Initialize SQLite database schema and seed data
  await getDatabase();

  // Initialize Socket.IO for WebRTC signaling and real-time features
  setupSocketIO(httpServer);

  // Global Middlewares
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'LiveClass Backend Service',
      time: new Date().toISOString(),
      platform: 'Google AI Studio',
    });
  });

  // REST API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/classes', classRoutes);
  app.use('/api/recordings', recordingRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/subjects', subjectRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/materials', materialRoutes);

  // Vite middleware in dev or pre-built static files in production
  const distPath = path.join(process.cwd(), 'dist');
  const hasBuiltDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' || (hasBuiltDist && !process.env.VITE_DEV_SERVER);

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`LiveClass Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start LiveClass server:', err);
  process.exit(1);
});
