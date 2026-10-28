import { Router } from 'express'
import pool from '../db.js'
import { authMiddleware, requireRole } from '../auth.js'
import { uid } from '../util.js'

const router = Router()

// GET /api/students - teacher gets class students, parent & student get their linked student
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (req.userRole === 'teacher') {
      const [classes] = await pool.query('SELECT class_name FROM teacher_classes WHERE teacher_id = ?', [req.userId])
      const classNames = classes.map(c => c.class_name)
      if (!classNames.length) return res.json([])
      const [students] = await pool.query(
        `SELECT * FROM students WHERE class_name IN (${classNames.map(() => '?').join(',')}) ORDER BY class_name, name`,
        classNames
      )
      return res.json(students)
    }

    // Parent or Student
    const [users] = await pool.query('SELECT student_id FROM users WHERE id = ?', [req.userId])
    const studentId = users[0]?.student_id
    if (!studentId) return res.json([])
    const [students] = await pool.query('SELECT * FROM students WHERE id = ?', [studentId])
    res.json(students)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/students - teacher adds a student
router.post('/', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { nis, name, className } = req.body
  if (!nis?.trim() || !name?.trim() || !className) return res.status(400).json({ error: 'NIS, nama, dan kelas wajib diisi.' })
  try {
    const [dupe] = await pool.query('SELECT id FROM students WHERE nis = ?', [nis.trim()])
    if (dupe.length) return res.status(409).json({ error: 'NIS sudah terdaftar.' })
    const id = uid()
    await pool.query('INSERT INTO students (id, nis, name, class_name) VALUES (?,?,?,?)', [id, nis.trim(), name.trim(), className])
    const [rows] = await pool.query('SELECT * FROM students WHERE id = ?', [id])
    res.status(201).json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/students/:id
router.delete('/:id', authMiddleware, requireRole('teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM students WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Teacher Schedule ─────────────────────────────────────────

// GET /api/students/schedule - get teacher's schedule
router.get('/schedule', authMiddleware, requireRole('teacher'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM teacher_schedules WHERE teacher_id = ? ORDER BY day_of_week, start_time',
      [req.userId]
    )
    res.json(rows.map(s => ({
      id: s.id,
      day: s.day_of_week,
      start: s.start_time.slice(0, 5),
      end: s.end_time.slice(0, 5),
      className: s.class_name,
      subject: s.subject,
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/students/schedule - add schedule item
router.post('/schedule', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { day, start, end, className, subject } = req.body
  if (!subject?.trim() || !className?.trim()) return res.status(400).json({ error: 'Mata pelajaran dan kelas wajib diisi.' })
  if (end <= start) return res.status(400).json({ error: 'Jam selesai harus setelah jam mulai.' })
  try {
    // Check overlap
    const [overlap] = await pool.query(
      'SELECT id FROM teacher_schedules WHERE teacher_id = ? AND day_of_week = ? AND start_time < ? AND end_time > ?',
      [req.userId, day, end, start]
    )
    if (overlap.length) return res.status(409).json({ error: 'Jam ini bentrok dengan jadwal lain di hari yang sama.' })

    const id = uid()
    await pool.query(
      'INSERT INTO teacher_schedules (id, teacher_id, day_of_week, start_time, end_time, class_name, subject) VALUES (?,?,?,?,?,?,?)',
      [id, req.userId, day, start, end, className.trim().toUpperCase(), subject.trim()]
    )
    res.status(201).json({ id, day, start, end, className: className.trim().toUpperCase(), subject: subject.trim() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/students/schedule/:id
router.delete('/schedule/:id', authMiddleware, requireRole('teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM teacher_schedules WHERE id = ? AND teacher_id = ?', [req.params.id, req.userId])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
