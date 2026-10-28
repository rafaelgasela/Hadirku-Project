import { Router } from 'express'
import pool from '../db.js'
import { authMiddleware, requireRole } from '../auth.js'
import { uid } from '../util.js'

const router = Router()

// GET /api/notices - get my notices
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notices WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [req.userId]
    )
    res.json(rows.map(formatNotice))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/notices/mark-read - mark all as read
router.post('/mark-read', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE notices SET is_read = 1 WHERE user_id = ?', [req.userId])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/notices/self - create a self notice (e.g. schedule reminder from client)
router.post('/self', authMiddleware, async (req, res) => {
  const { type = 'info', title, text, kind = 'info' } = req.body
  if (!title || !text) return res.status(400).json({ error: 'title dan text wajib diisi.' })
  const validTypes = ['success', 'warning', 'info']
  const validKinds = ['reminder', 'checkin', 'late', 'absent', 'leave', 'session', 'info']
  try {
    await pool.query(
      'INSERT INTO notices (id, user_id, notice_type, kind, title, notice_text) VALUES (?,?,?,?,?,?)',
      [uid(), req.userId, validTypes.includes(type) ? type : 'info', validKinds.includes(kind) ? kind : 'info', title, text]
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/notices/unread-count
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM notices WHERE user_id = ? AND is_read = 0',
      [req.userId]
    )
    res.json({ count: rows[0].count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function formatNotice(n) {
  return {
    id: n.id,
    userId: n.user_id,
    type: n.notice_type,
    kind: n.kind,
    title: n.title,
    text: n.notice_text,
    at: new Date(n.created_at).getTime(),
    read: !!n.is_read,
  }
}

export default router
