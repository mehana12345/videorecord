import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { queryAll, queryOne, execute } from '../db.ts';
import { authenticate, AuthenticatedRequest } from '../auth.ts';
import { StorageProvider } from '../storage.ts';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// GET study materials for a class
router.get('/class/:classId', (req, res) => {
  try {
    const { classId } = req.params;
    const materials = queryAll(
      'SELECT id, class_id as classId, title, file_name as fileName, file_url as fileUrl, file_size as fileSize, uploaded_at as uploadedAt FROM study_materials WHERE class_id = ? ORDER BY uploaded_at DESC',
      [classId]
    );
    res.json({ materials });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch study materials' });
  }
});

// UPLOAD study material (Faculty/Admin)
router.post('/upload', authenticate, upload.single('file') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { classId, title } = req.body;
    const file = req.file;

    if (!classId || !title) {
      return res.status(400).json({ error: 'classId and title are required' });
    }

    const id = 'mat-' + Date.now();
    const originalName = file?.originalname || 'Lecture_Notes.pdf';
    const cleanName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}_${cleanName}`;
    const filePath = path.join(StorageProvider.getMaterialsDir(), filename);

    if (file && file.buffer) {
      await fs.promises.writeFile(filePath, file.buffer);
    }

    const fileUrl = `/api/materials/download/${filename}`;
    const fileSize = file ? file.size : 2048000;

    execute(
      `INSERT INTO study_materials (id, class_id, title, file_name, file_url, file_size) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, classId, title, originalName, fileUrl, fileSize]
    );

    res.status(201).json({
      message: 'Study material uploaded successfully',
      material: { id, classId, title, fileName: originalName, fileUrl, fileSize },
    });
  } catch (err: any) {
    console.error('Material upload error:', err);
    res.status(500).json({ error: 'Failed to upload study material' });
  }
});

// DOWNLOAD study material file
router.get('/download/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(StorageProvider.getMaterialsDir(), safeFilename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found on disk' });
  }
});

export default router;
