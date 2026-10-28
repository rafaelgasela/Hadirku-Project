import { Router } from 'express'
import bcrypt from 'bcrypt'
import pool from '../db.js'
import { authMiddleware } from '../auth.js'
import { uid } from '../util.js'
import { safeUser } from './authRoutes.js'

const router = Router()

// GET /api/me - get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.userId])
    const user = rows[0]
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' })

    const result = safeUser(user)

    // Attach teacher classes
    if (user.role === 'teacher') {
      const [classes] = await pool.query('SELECT class_name FROM teacher_classes WHERE teacher_id = ?', [user.id])
      result.classes = classes.map(c => c.class_name)
      const [schedules] = await pool.query('SELECT * FROM teacher_schedules WHERE teacher_id = ? ORDER BY day_of_week, start_time', [user.id])
      result.schedule = schedules.map(s => ({
        id: s.id,
        day: s.day_of_week,
        start: s.start_time.slice(0, 5),
        end: s.end_time.slice(0, 5),
        className: s.class_name,
        subject: s.subject,
      }))
    }

    // Attach prefs
    const [prefs] = await pool.query('SELECT * FROM notification_prefs WHERE user_id = ?', [user.id])
    if (prefs[0]) {
      const p = prefs[0]
      result.prefs = {
        push: !!p.push_notif, checkin: !!p.notif_checkin, late: !!p.notif_late,
        absent: !!p.notif_absent, leave: !!p.notif_leave, session: !!p.notif_session,
        reminder: !!p.notif_reminder, preview: !!p.preview, sound: !!p.sound,
        quiet: !!p.quiet_mode, quietFrom: p.quiet_from?.slice(0, 5) || '21:00',
        quietTo: p.quiet_to?.slice(0, 5) || '05:30',
      }
    }

    // Attach devices
    const [devices] = await pool.query(
      'SELECT * FROM devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_active DESC',
      [user.id]
    )
    result.devices = devices.map(d => ({
      id: d.device_key,
      name: d.name,
      kind: d.kind,
      browser: d.browser,
      firstSeen: new Date(d.first_seen).getTime(),
      lastActive: new Date(d.last_active).getTime(),
    }))

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/me - update profile
router.put('/me', authMiddleware, async (req, res) => {
  const { name, email, phone, avatar } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nama tidak boleh kosong.' })
  const cleanEmail = email?.trim().toLowerCase()
  if (!cleanEmail) return res.status(400).json({ error: 'Email tidak boleh kosong.' })

  try {
    const [dupe] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [cleanEmail, req.userId])
    if (dupe.length) return res.status(409).json({ error: 'Email sudah dipakai akun lain.' })

    const cleanPhone = phone?.replace(/[\s-]/g, '') || null
    if (cleanPhone && !/^(\+62|62|0)8\d{7,12}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Nomor telepon tidak valid.' })
    }

    await pool.query(
      'UPDATE users SET name = ?, email = ?, phone = ?, avatar_url = ? WHERE id = ?',
      [name.trim(), cleanEmail, cleanPhone, avatar || null, req.userId]
    )

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.userId])
    res.json(safeUser(rows[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/me/change-password
router.post('/me/change-password', authMiddleware, async (req, res) => {
  const { current, next: newPass } = req.body
  if (!newPass || newPass.length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter.' })
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.userId])
    const user = rows[0]
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' })

    const needsCurrent = !(user.provider && !user.pass_set)
    if (needsCurrent) {
      if (!current) return res.status(400).json({ error: 'Password saat ini wajib diisi.' })
      const ok = await bcrypt.compare(current, user.password_hash || '')
      if (!ok) return res.status(401).json({ error: 'Password saat ini salah.' })
      if (current === newPass) return res.status(400).json({ error: 'Password baru harus berbeda.' })
    }

    const hash = await bcrypt.hash(newPass, 12)
    await pool.query('UPDATE users SET password_hash = ?, pass_set = 1 WHERE id = ?', [hash, req.userId])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/me/prefs - update notification preferences
router.put('/me/prefs', authMiddleware, async (req, res) => {
  const p = req.body
  try {
    await pool.query(`
      INSERT INTO notification_prefs (user_id, push_notif, notif_checkin, notif_late, notif_absent, notif_leave, notif_session, notif_reminder, preview, sound, quiet_mode, quiet_from, quiet_to)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        push_notif=VALUES(push_notif), notif_checkin=VALUES(notif_checkin), notif_late=VALUES(notif_late),
        notif_absent=VALUES(notif_absent), notif_leave=VALUES(notif_leave), notif_session=VALUES(notif_session),
        notif_reminder=VALUES(notif_reminder), preview=VALUES(preview), sound=VALUES(sound),
        quiet_mode=VALUES(quiet_mode), quiet_from=VALUES(quiet_from), quiet_to=VALUES(quiet_to)
    `, [
      req.userId,
      p.push ? 1 : 0, p.checkin ? 1 : 0, p.late ? 1 : 0, p.absent ? 1 : 0,
      p.leave ? 1 : 0, p.session ? 1 : 0, p.reminder ? 1 : 0, p.preview ? 1 : 0,
      p.sound ? 1 : 0, p.quiet ? 1 : 0, p.quietFrom || '21:00', p.quietTo || '05:30',
    ])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/me/touch-device
router.post('/me/touch-device', authMiddleware, async (req, res) => {
  const { deviceKey, name, kind, browser } = req.body
  if (!deviceKey) return res.status(400).json({ error: 'deviceKey wajib.' })
  try {
    const [exist] = await pool.query('SELECT id FROM devices WHERE user_id = ? AND device_key = ?', [req.userId, deviceKey])
    if (exist.length) {
      await pool.query('UPDATE devices SET last_active = NOW() WHERE user_id = ? AND device_key = ?', [req.userId, deviceKey])
    } else {
      const id = uid()
      await pool.query(
        'INSERT INTO devices (id, user_id, device_key, name, kind, browser) VALUES (?,?,?,?,?,?)',
        [id, req.userId, deviceKey, name || 'Browser', kind || 'desktop', browser || 'Browser']
      )
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/me/devices/:deviceKey
router.delete('/me/devices/:deviceKey', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'UPDATE devices SET revoked_at = NOW() WHERE user_id = ? AND device_key = ?',
      [req.userId, req.params.deviceKey]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/me/devices - revoke others
router.delete('/me/devices', authMiddleware, async (req, res) => {
  const { keep } = req.query
  try {
    await pool.query(
      'UPDATE devices SET revoked_at = NOW() WHERE user_id = ? AND device_key != ?',
      [req.userId, keep || '']
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
