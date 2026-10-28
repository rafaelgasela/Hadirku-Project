import { Router } from 'express'
import pool from '../db.js'
import { authMiddleware, requireRole } from '../auth.js'
import { uid, dateKey, timeKey, makeQrToken, readQrToken, qrSlot, SLOT_MS, LATE_AFTER_MIN } from '../util.js'

const router = Router()

// ─── Sessions ─────────────────────────────────────────────────

// POST /api/sessions - open new QR session
router.post('/', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { className, subject, minutes = 90 } = req.body
  if (!className || !subject) return res.status(400).json({ error: 'Kelas dan mata pelajaran wajib diisi.' })
  try {
    // Check for active session
    const [active] = await pool.query(
      'SELECT id FROM sessions WHERE teacher_id = ? AND closed_at IS NULL AND ends_at > NOW()',
      [req.userId]
    )
    if (active.length) return res.status(409).json({ error: 'Masih ada sesi yang aktif. Tutup dulu sebelum membuat yang baru.' })

    const id = uid()
    const secret = Math.random().toString(36).slice(2)
    const endsAt = new Date(Date.now() + minutes * 60000)

    await pool.query(
      'INSERT INTO sessions (id, teacher_id, class_name, subject, ends_at, secret) VALUES (?,?,?,?,?,?)',
      [id, req.userId, className, subject.trim() || 'Pelajaran', endsAt, secret]
    )

    // Notify students and parents
    const [students] = await pool.query('SELECT * FROM students WHERE class_name = ?', [className])
    for (const st of students) {
      const [related] = await pool.query("SELECT id, role FROM users WHERE student_id = ? AND role IN ('student','parent')", [st.id])
      for (const u of related) {
        const noticeId = uid()
        const extra = u.role === 'student' ? ' Scan QR di layar guru.' : ''
        const timeStr = new Date().toTimeString().slice(0, 5).replace(':', '.')
        await pool.query(
          'INSERT INTO notices (id, user_id, notice_type, kind, title, notice_text) VALUES (?,?,?,?,?,?)',
          [noticeId, u.id, 'info', 'session', 'Sesi absensi dibuka', `${subject} untuk kelas ${className} dimulai pukul ${timeStr}.${extra}`]
        )
      }
    }

    const [rows] = await pool.query('SELECT * FROM sessions WHERE id = ?', [id])
    res.status(201).json(formatSession(rows[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sessions/active - get teacher's active session
router.get('/active', authMiddleware, requireRole('teacher'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM sessions WHERE teacher_id = ? AND closed_at IS NULL AND ends_at > NOW() ORDER BY started_at DESC LIMIT 1',
      [req.userId]
    )
    if (!rows.length) return res.json(null)
    res.json(formatSession(rows[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sessions/live/:className - get live session for a class
router.get('/live/:className', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM sessions WHERE class_name = ? AND closed_at IS NULL AND ends_at > NOW() ORDER BY started_at DESC LIMIT 1',
      [req.params.className]
    )
    if (!rows.length) return res.json(null)
    res.json(formatSession(rows[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sessions/:id - get session with stats
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sessions WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Sesi tidak ditemukan.' })
    res.json(formatSession(rows[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sessions/:id/close
router.post('/:id/close', authMiddleware, requireRole('teacher'), async (req, res) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM sessions WHERE id = ? AND teacher_id = ?', [req.params.id, req.userId])
    const s = rows[0]
    if (!s) return res.status(404).json({ error: 'Sesi tidak ditemukan.' })
    if (s.closed_at) return res.status(409).json({ error: 'Sesi sudah ditutup.' })

    const closedAt = new Date(Math.min(Date.now(), new Date(s.ends_at).getTime()))
    await conn.query('UPDATE sessions SET closed_at = ? WHERE id = ?', [closedAt, s.id])

    // Mark absent students who didn't check in
    const dateStr = dateKey(new Date(s.started_at))
    const [students] = await conn.query('SELECT * FROM students WHERE class_name = ?', [s.class_name])
    for (const st of students) {
      const [att] = await conn.query('SELECT id FROM attendance WHERE session_id = ? AND student_id = ?', [s.id, st.id])
      if (att.length) continue

      // Check for approved leave
      const [leave] = await conn.query(
        "SELECT * FROM leaves WHERE student_id = ? AND leave_date = ? AND status = 'approved'",
        [st.id, dateStr]
      )
      const status = leave.length ? leave[0].leave_type : 'alpa'
      await conn.query(
        'INSERT INTO attendance (id, student_id, session_id, attend_date, status, time_str, is_manual) VALUES (?,?,?,?,?,?,1)',
        [uid(), st.id, s.id, dateStr, status, '—']
      )

      if (!leave.length) {
        const [parents] = await conn.query("SELECT id FROM users WHERE student_id = ? AND role = 'parent'", [st.id])
        for (const p of parents) {
          await conn.query(
            'INSERT INTO notices (id, user_id, notice_type, kind, title, notice_text) VALUES (?,?,?,?,?,?)',
            [uid(), p.id, 'warning', 'absent', `${st.name.split(' ')[0]} tidak tercatat hadir`,
              `Tidak ada check-in pada sesi ${s.subject} hari ini.`]
          )
        }
      }
    }

    await conn.commit()
    res.json({ ok: true })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ error: err.message })
  } finally {
    conn.release()
  }
})

// GET /api/sessions/:id/qr - get current QR token
router.get('/:id/qr', authMiddleware, requireRole('teacher'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sessions WHERE id = ? AND teacher_id = ?', [req.params.id, req.userId])
    const s = rows[0]
    if (!s) return res.status(404).json({ error: 'Sesi tidak ditemukan.' })
    const now = Date.now()
    const token = makeQrToken({ id: s.id, secret: s.secret }, now)
    const slot = qrSlot(now)
    res.json({ token, slot, slotMs: SLOT_MS, expiresIn: SLOT_MS - (now % SLOT_MS) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Check-in ─────────────────────────────────────────────────

// POST /api/sessions/checkin - check in via QR token
router.post('/checkin', async (req, res) => {
  const { token, nis, selfCheckin = false } = req.body
  if (!token || !nis) return res.status(400).json({ error: 'Token dan NIS wajib diisi.' })

  const conn = await pool.getConnection()
  try {
    const [sessions] = await conn.query(
      'SELECT * FROM sessions WHERE closed_at IS NULL AND ends_at > NOW()'
    )
    const { session, error: tokenError } = readQrToken(token, sessions)
    if (tokenError || !session) return res.status(400).json({ error: tokenError })

    const [students] = await conn.query('SELECT * FROM students WHERE nis = ?', [nis.trim()])
    const student = students[0]
    if (!student) return res.status(404).json({ error: 'NIS tidak ditemukan.' })
    if (student.class_name !== session.class_name) {
      return res.status(400).json({ error: `Sesi ini untuk kelas ${session.class_name}. ${student.name} terdaftar di ${student.class_name}.` })
    }

    const [existing] = await conn.query(
      "SELECT * FROM attendance WHERE session_id = ? AND student_id = ? AND status != 'alpa'",
      [session.id, student.id]
    )
    if (existing.length) return res.json({ student, attendance: existing[0], already: true })

    await conn.beginTransaction()
    const now = Date.now()
    const startedAt = new Date(session.started_at).getTime()
    const late = now - startedAt > LATE_AFTER_MIN * 60000
    const status = late ? 'terlambat' : 'hadir'
    const timeStr = timeKey()
    const attId = uid()
    const dateStr = dateKey(new Date(session.started_at))

    await conn.query('DELETE FROM attendance WHERE session_id = ? AND student_id = ?', [session.id, student.id])
    await conn.query(
      'INSERT INTO attendance (id, student_id, session_id, attend_date, status, time_str, is_self) VALUES (?,?,?,?,?,?,?)',
      [attId, student.id, session.id, dateStr, status, timeStr, selfCheckin ? 1 : 0]
    )

    const [parents] = await conn.query("SELECT id FROM users WHERE student_id = ? AND role = 'parent'", [student.id])
    for (const p of parents) {
      const firstName = student.name.split(' ')[0]
      await conn.query(
        'INSERT INTO notices (id, user_id, notice_type, kind, title, notice_text) VALUES (?,?,?,?,?,?)',
        [uid(), p.id, late ? 'warning' : 'success', 'checkin',
          late ? `${firstName} terlambat` : `${firstName} sudah tiba di sekolah`,
          `Check-in ${late ? 'terlambat ' : ''}tercatat pukul ${timeStr} untuk ${session.subject}.`]
      )
    }

    await conn.commit()
    const [attRow] = await conn.query('SELECT * FROM attendance WHERE id = ?', [attId])
    res.json({ student, attendance: attRow[0], already: false })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ error: err.message })
  } finally {
    conn.release()
  }
})

// POST /api/sessions/:id/mark - teacher manually marks attendance
router.post('/:id/mark', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { studentId, status } = req.body
  if (!studentId || !status) return res.status(400).json({ error: 'studentId dan status wajib.' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [sessions] = await conn.query('SELECT * FROM sessions WHERE id = ? AND teacher_id = ?', [req.params.id, req.userId])
    const s = sessions[0]
    if (!s) return res.status(404).json({ error: 'Sesi tidak ditemukan.' })
    const [students] = await conn.query('SELECT * FROM students WHERE id = ?', [studentId])
    const st = students[0]
    if (!st) return res.status(404).json({ error: 'Siswa tidak ditemukan.' })

    const now = Date.now()
    const timeStr = (status === 'hadir' || status === 'terlambat') ? timeKey() : '—'
    const dateStr = dateKey(new Date(s.started_at))

    await conn.query('DELETE FROM attendance WHERE session_id = ? AND student_id = ?', [s.id, studentId])
    await conn.query(
      'INSERT INTO attendance (id, student_id, session_id, attend_date, status, time_str, is_manual) VALUES (?,?,?,?,?,?,1)',
      [uid(), studentId, s.id, dateStr, status, timeStr]
    )

    const [parents] = await conn.query("SELECT id FROM users WHERE student_id = ? AND role = 'parent'", [studentId])
    for (const p of parents) {
      await conn.query(
        'INSERT INTO notices (id, user_id, notice_type, kind, title, notice_text) VALUES (?,?,?,?,?,?)',
        [uid(), p.id, status === 'hadir' ? 'success' : 'warning', 'checkin',
          `Status ${st.name.split(' ')[0]} diperbarui`,
          `Guru mencatat ${st.name.split(' ')[0]} sebagai "${status}" pada sesi ${s.subject}.`]
      )
    }

    await conn.commit()
    res.json({ ok: true })
  } catch (err) {
    await conn.rollback()
    res.status(500).json({ error: err.message })
  } finally {
    conn.release()
  }
})

// GET /api/sessions/:id/roster - get session attendance roster
router.get('/:id/roster', authMiddleware, async (req, res) => {
  try {
    const [sessions] = await pool.query('SELECT * FROM sessions WHERE id = ?', [req.params.id])
    const s = sessions[0]
    if (!s) return res.status(404).json({ error: 'Sesi tidak ditemukan.' })

    const [students] = await pool.query('SELECT * FROM students WHERE class_name = ? ORDER BY name', [s.class_name])
    const [attendance] = await pool.query('SELECT * FROM attendance WHERE session_id = ?', [s.id])
    const byStudent = new Map(attendance.map(a => [a.student_id, a]))

    res.json(students.map(st => ({
      ...st,
      attendance: byStudent.get(st.id) || null,
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── helpers ─────────────────────────────────────────────────

function formatSession(s) {
  return {
    id: s.id,
    teacherId: s.teacher_id,
    className: s.class_name,
    subject: s.subject,
    startedAt: new Date(s.started_at).getTime(),
    endsAt: new Date(s.ends_at).getTime(),
    secret: s.secret,
    closedAt: s.closed_at ? new Date(s.closed_at).getTime() : undefined,
  }
}

export default router
