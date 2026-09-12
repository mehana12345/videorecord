import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';

const UPLOAD_BASE_DIR = path.join(process.cwd(), 'uploads');
const RECORDINGS_DIR = path.join(UPLOAD_BASE_DIR, 'recordings');
const MATERIALS_DIR = path.join(UPLOAD_BASE_DIR, 'materials');

// Ensure upload directories exist
[UPLOAD_BASE_DIR, RECORDINGS_DIR, MATERIALS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export interface StoredFile {
  filename: string;
  originalName: string;
  url: string;
  size: number;
  mimeType: string;
}

export const StorageProvider = {
  getRecordingsDir(): string {
    return RECORDINGS_DIR;
  },

  getMaterialsDir(): string {
    return MATERIALS_DIR;
  },

  /**
   * Save uploaded recording file to persistent disk (or mock S3)
   */
  async saveRecordingFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string = 'video/webm'
  ): Promise<StoredFile> {
    const timestamp = Date.now();
    const cleanName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `rec_${timestamp}_${cleanName}`;
    const filePath = path.join(RECORDINGS_DIR, filename);

    await fs.promises.writeFile(filePath, buffer);
    const stats = await fs.promises.stat(filePath);

    return {
      filename,
      originalName,
      url: `/api/recordings/stream/${filename}`,
      size: stats.size,
      mimeType,
    };
  },

  /**
   * Stream a video with HTTP 206 Partial Content support (Range headers)
   * This is required for scrubbing, seeking, and smooth playback on web browsers!
   */
  streamVideo(req: Request, res: Response, filename: string) {
    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(RECORDINGS_DIR, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Recording file not found on disk' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const mimeType = safeFilename.endsWith('.mp4') ? 'video/mp4' : 'video/webm';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
        return;
      }

      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  },

  /**
   * Delete a recording file from disk
   */
  async deleteRecordingFile(filename: string): Promise<boolean> {
    try {
      const safeFilename = path.basename(filename);
      const filePath = path.join(RECORDINGS_DIR, safeFilename);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error deleting recording file:', err);
      return false;
    }
  },
};
