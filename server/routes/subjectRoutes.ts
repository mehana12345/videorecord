import { Router, Request, Response } from 'express';
import { queryAll, queryOne, execute } from '../db.ts';
import { authenticate, authorizeRole, AuthenticatedRequest } from '../auth.ts';

const router = Router();

// GET all subjects
router.get('/', (req: Request, res: Response) => {
  try {
    const { department } = req.query;
    let sql = 'SELECT id, code, name, department, semester, color, description FROM subjects';
    const params: any[] = [];
    if (department) {
      sql += ' WHERE department = ?';
      params.push(department);
    }
    sql += ' ORDER BY code ASC';

    const subjects = queryAll(sql, params);
    res.json({ subjects });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// CREATE subject (Admin only)
router.post('/', authenticate, authorizeRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, name, department, semester, color, description } = req.body;
    if (!code || !name || !department) {
      return res.status(400).json({ error: 'Code, name, and department are required' });
    }

    const id = 'subj-' + Date.now();
    const sem = parseInt(semester, 10) || 1;
    const subjColor = color || '#6366f1';

    execute(
      `INSERT INTO subjects (id, code, name, department, semester, color, description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, department, sem, subjColor, description || '']
    );

    res.status(201).json({ message: 'Subject created', id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create subject' });
  }
});

// DELETE subject (Admin only)
router.delete('/:id', authenticate, authorizeRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    execute('DELETE FROM subjects WHERE id = ?', [id]);
    res.json({ message: 'Subject deleted' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete subject' });
  }
});

export default router;
