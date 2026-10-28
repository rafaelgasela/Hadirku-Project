import { Router } from 'express'
import pool from '../db.js'
import { authMiddleware, requireRole } from '../auth.js'
import { uid } from '../util.js'

const router = Router()

// GET /api/leaves - parent: my leaves, teacher: pending for their classes
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (req.userRole === 'parent') {
      // Find student linked to this parent
      const [users] = await pool.query('SELECT student_id FROM users WHERE id = ?', [req.userId])
      const studentId = users[0]?.student_id
      if (!studentId) return res.json([])
      const [leaves] = await pool.query(
        'SELECT l.*, s.name as student_name, s.class_name, s.nis FROM leaves l JOIN students s ON l.student_id = s.id WHERE l.student_id = ? ORDER BY l.created_at DESC',
        [studentId]
      )
      res.json(leaves)
    } else if (req.userRole === 'teacher') {
      const [classes] = await pool.query('SELECT class_name FROM teacher_classes WHERE teacher_id = ?', [req.userId])
      const classNames = classes.map(c => c.class_name)
      if (!classNames.length) return res.json([])
      const [leaves] = await pool.query(
        `SELECT l.*, s.name as student_name, s.class_name, s.nis
         FROM leaves l JOIN students s ON l.student_id = s.id
         WHERE s.class_name IN (${classNames.map(() => '?').join(',')})
         ORDER BY l.created_at DESC`,
        classNames
      )
      res.json(leaves)
    } else {
      res.status(403).json({ error: 'Akses ditolak.' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/leaves - parent submits leave
router.post('/', authMiddleware, requireRole('parent'), async (req, res) => {
  const { type, date, reason, proofName, proofUrl } = req.body
  if (!type || !date || !reason) return res.status(400).json({ error: 'Tipe, tanggal, dan alasan wajib diisi.' })
  try {
    const [users] = await pool.query('SELECT student_id FROM users WHERE id = ?', [req.userId])
    const studentId = users[0]?.student_id
    if (!studentId) return res.status(400).json({ error: 'Data siswa tidak ditemukan.' })

    // Check for existing leave on same date
    const [dupe] = await pool.query(
      "SELECT id FROM leaves WHERE student_id = ? AND leave_date = ? AND status != 'rejected'",
      [studentId, date]
    )
    if (dupe.length) return res.status(409).json({ error: 'Sudah ada pengajuan untuk tanggal tersebut.' })

    const id = uid()
    await pool.query(
      'INSERT INTO leaves (id, student_id, parent_id, leave_type, leave_date, reason, proof_name, proof_url) VALUES (?,?,?,?,?,?,?,?)',
      [id, studentId, req.userId, type, date, reason.trim(), proofName || null, proofUrl || null]
    )

    // Notify teachers
    const [students] = await pool.query('SELECT * FROM students WHERE id = ?', [studentId])
    const student = students[0]
    if (student) {
      const [teachers] = await pool.query(
        'SELECT u.id FROM users u JOIN teacher_classes tc ON u.id = tc.teacher_id WHERE tc.class_name = ? AND u.role = ?',
        [student.class_name, 'teacher']
      )
      for (const t of teachers) {
        await pool.query(
          'INSERT INTO notices (id, user_id, notice_type, kind, title, notice_text) VALUES (?,?,?,?,?,?)',
          [uid(), t.id, 'info', 'leave', `Pengajuan ${type} baru`,
            `${student.name} (${student.class_name}) mengajukan ${type} untuk ${date}.`]
        )
      }
    }

    const [rows] = await pool.query('SELECT * FROM leaves WHERE id = ?', [id])
    res.status(201).json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/leaves/:id/decide - teacher approves/rejects
router.put('/:id/decide', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { decision } = req.body
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Keputusan tidak valid.' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query(
      'SELECT l.*, s.name as student_name, s.class_name FROM leaves l JOIN students s ON l.student_id = s.id WHERE l.id = ?',
      [req.params.id]
    )
    const l = rows[0]
    if (!l) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' })

    // Verify teacher has class access
    const [access] = await conn.query('SELECT 1 FROM teacher_classes WHERE teacher_id = ? AND class_name = ?', [req.userId, l.class_name])
    if (!access.length) return res.status(403).json({ error: 'Akses ditolak.' })

    await conn.query('UPDATE leaves SET status = ? WHERE id = ?', [decision, l.id])

    // Notify parent
    const firstName = l.student_name.split(' ')[0]
    await conn.query(
      'INSERT INTO notices (id, user_id, notice_type, kind, title, notice_text) VALUES (?,?,?,?,?,?)',
      [uid(), l.parent_id, decision === 'approved' ? 'success' : 'warning', 'leave',
        decision === 'approved' ? 'Pengajuan disetujui' : 'Pengajuan ditolak',
        `${l.leave_type === 'izin' ? 'Izin' : 'Sakit'} ${firstName} untuk ${l.leave_date} telah ${decision === 'approved' ? 'disetujui' : 'ditolak'} guru.`]
    )

    // If approved, update attendance records
    if (decision === 'approved') {
      const [sessions] = await conn.query(
        'SELECT * FROM sessions WHERE class_name = ? AND DATE(started_at) = ?',
        [l.class_name, l.leave_date]
      )
      for (const s of sessions) {
        await conn.query(
          "DELETE FROM attendance WHERE session_id = ? AND student_id = ? AND status = 'alpa'",
          [s.id, l.student_id]
        )
        const [existing] = await conn.query('SELECT id FROM attendance WHERE session_id = ? AND student_id = ?', [s.id, l.student_id])
        if (!existing.length) {
          await conn.query(
            'INSERT INTO attendance (id, student_id, session_id, attend_date, status, time_str, is_manual) VALUES (?,?,?,?,?,?,1)',
            [uid(), l.student_id, s.id, l.leave_date, l.leave_type, '—']
          )
        }
      }
    }

    await conn.commit()
    res.json({ ok: true, decision })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ error: err.message })
  } finally {
    conn.release()
  }
})

export default router
