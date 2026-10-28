import { Router } from 'express'
import bcrypt from 'bcrypt'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as FacebookStrategy } from 'passport-facebook'
import pool from '../db.js'
import { signJwt } from '../auth.js'
import { uid } from '../util.js'
import dotenv from 'dotenv'
dotenv.config()

const router = Router()
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

// ─── Passport setup ──────────────────────────────────────────

// Google Strategy
if (process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.includes('XXXX')) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.API_URL || 'http://localhost:3001'}/auth/google/callback`,
    scope: ['profile', 'email'],
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value
      const name = profile.displayName
      const providerId = profile.id
      if (!email) return done(new Error('Email Google tidak ditemukan.'))
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email])
      let user = rows[0]
      if (user) {
        if (!user.provider_id) {
          await pool.query('UPDATE users SET provider = ?, provider_id = ? WHERE id = ?', ['google', providerId, user.id])
        }
        return done(null, user)
      }
      // New user via Google - will need to complete registration
      return done(null, { google_pending: true, email, name, provider: 'google', provider_id: providerId })
    } catch (err) {
      done(err)
    }
  }))
}

// Facebook Strategy
if (process.env.FACEBOOK_APP_ID && !process.env.FACEBOOK_APP_ID.includes('000000000')) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: `${process.env.API_URL || 'http://localhost:3001'}/auth/facebook/callback`,
    profileFields: ['id', 'emails', 'name', 'displayName'],
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value
      const name = profile.displayName || [profile.name?.givenName, profile.name?.familyName].filter(Boolean).join(' ') || 'Pengguna Facebook'
      const providerId = profile.id
      const [rows] = await pool.query('SELECT * FROM users WHERE (provider = "facebook" AND provider_id = ?) OR (email = ? AND email != "") LIMIT 1', [providerId, email || ''])
      let user = rows[0]
      if (user) {
        if (!user.provider_id) {
          await pool.query('UPDATE users SET provider = ?, provider_id = ? WHERE id = ?', ['facebook', providerId, user.id])
        }
        return done(null, user)
      }
      return done(null, { facebook_pending: true, email: email || '', name, provider: 'facebook', provider_id: providerId })
    } catch (err) {
      done(err)
    }
  }))
}

passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((user, done) => done(null, user))

// ─── Login / Register biasa ──────────────────────────────────

router.post('/login', async (req, res) => {
  const { email, password, role } = req.body
  if (!email || !password || !role) return res.status(400).json({ error: 'Email, password, dan role wajib diisi.' })
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email.trim().toLowerCase()])
    const user = rows[0]
    if (!user) return res.status(401).json({ error: 'Email atau password salah.' })
    if (user.role !== role) return res.status(401).json({ error: `Akun ini terdaftar sebagai ${user.role === 'parent' ? 'orang tua' : user.role === 'teacher' ? 'guru' : 'siswa'}.` })
    if (!user.password_hash) return res.status(401).json({ error: 'Akun ini hanya bisa login via Google atau Facebook.' })
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Email atau password salah.' })
    const token = signJwt({ userId: user.id, role: user.role })
    res.json({ token, user: safeUser(user) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/student-lookup', async (req, res) => {
  const { nis } = req.query
  if (!nis?.trim()) return res.json({ found: false })
  try {
    const [rows] = await pool.query('SELECT id, nis, name, class_name FROM students WHERE nis = ? LIMIT 1', [nis.trim()])
    if (!rows.length) return res.json({ found: false })
    res.json({
      found: true,
      student: {
        id: rows[0].id,
        nis: rows[0].nis,
        name: rows[0].name,
        className: rows[0].class_name,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/register/parent', async (req, res) => {
  const { name, email, password, childName, nis, className, provider, providerId } = req.body
  if (!name || !email || !childName || !nis) return res.status(400).json({ error: 'Semua field wajib diisi.' })
  if (!provider && (!password || password.length < 8)) return res.status(400).json({ error: 'Password minimal 8 karakter.' })
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()])
    if (existing.length) return res.status(409).json({ error: 'Email sudah terdaftar.' })

    const [students] = await pool.query('SELECT * FROM students WHERE nis = ?', [nis.trim()])
    let student = students[0]
    if (!student) {
      // Auto-create student record so school registration stays flexible
      const studentId = uid()
      const classVal = (className?.trim() || 'XI RPL 1').toUpperCase()
      await pool.query('INSERT INTO students (id, nis, name, class_name) VALUES (?,?,?,?)', [studentId, nis.trim(), childName.trim(), classVal])
      student = { id: studentId, nis: nis.trim(), name: childName.trim(), class_name: classVal }
    }

    const hash = password ? await bcrypt.hash(password, 12) : null
    const id = uid()
    await pool.query(
      'INSERT INTO users (id, role, name, email, password_hash, pass_set, provider, provider_id, student_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, 'parent', name.trim(), email.trim().toLowerCase(), hash, password ? 1 : 0, provider || null, providerId || null, student.id]
    )
    await pool.query('INSERT INTO notification_prefs (user_id) VALUES (?)', [id])
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id])
    const token = signJwt({ userId: id, role: 'parent' })
    res.status(201).json({ token, user: safeUser(rows[0]) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/register/student', async (req, res) => {
  const { name, email, password, nis, className, phone, provider, providerId } = req.body
  if (!name || !email || !nis) return res.status(400).json({ error: 'Semua field wajib diisi.' })
  if (!provider && (!password || password.length < 8)) return res.status(400).json({ error: 'Password minimal 8 karakter.' })
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()])
    if (existing.length) return res.status(409).json({ error: 'Email sudah terdaftar.' })

    const [students] = await pool.query('SELECT * FROM students WHERE nis = ?', [nis.trim()])
    let student = students[0]
    if (!student) {
      // Auto-create student record so school registration stays flexible
      const studentId = uid()
      const classVal = (className?.trim() || 'XI RPL 1').toUpperCase()
      await pool.query('INSERT INTO students (id, nis, name, class_name) VALUES (?,?,?,?)', [studentId, nis.trim(), name.trim(), classVal])
      student = { id: studentId, nis: nis.trim(), name: name.trim(), class_name: classVal }
    } else {
      const [dupe] = await pool.query("SELECT id FROM users WHERE role = 'student' AND student_id = ?", [student.id])
      if (dupe.length) return res.status(409).json({ error: 'Akun siswa untuk NIS ini sudah ada.' })
    }

    const hash = password ? await bcrypt.hash(password, 12) : null
    const id = uid()
    const finalName = student.name || name.trim()
    await pool.query(
      'INSERT INTO users (id, role, name, email, password_hash, pass_set, provider, provider_id, phone, student_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, 'student', finalName, email.trim().toLowerCase(), hash, password ? 1 : 0, provider || null, providerId || null, phone?.trim() || null, student.id]
    )
    await pool.query('INSERT INTO notification_prefs (user_id) VALUES (?)', [id])
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id])
    const token = signJwt({ userId: id, role: 'student' })
    res.status(201).json({ token, user: safeUser(rows[0]) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/register/teacher', async (req, res) => {
  const { name, email, password, nip, subject, classes, provider, providerId } = req.body
  if (!name || !email || !nip || !subject || !classes) return res.status(400).json({ error: 'Semua field wajib diisi.' })
  if (!provider && (!password || password.length < 8)) return res.status(400).json({ error: 'Password minimal 8 karakter.' })
  const classArr = classes.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
  if (!classArr.length) return res.status(400).json({ error: 'Isi minimal satu kelas.' })
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()])
    if (existing.length) return res.status(409).json({ error: 'Email sudah terdaftar.' })
    const hash = password ? await bcrypt.hash(password, 12) : null
    const id = uid()
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query(
        'INSERT INTO users (id, role, name, email, password_hash, pass_set, provider, provider_id, nip, subject) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [id, 'teacher', name.trim(), email.trim().toLowerCase(), hash, password ? 1 : 0, provider || null, providerId || null, nip.trim(), subject.trim()]
      )
      for (const cls of classArr) {
        await conn.query('INSERT IGNORE INTO teacher_classes (teacher_id, class_name) VALUES (?,?)', [id, cls])
      }
      await conn.query('INSERT INTO notification_prefs (user_id) VALUES (?)', [id])
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id])
    const token = signJwt({ userId: id, role: 'teacher' })
    res.status(201).json({ token, user: safeUser(rows[0]) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Google OAuth (Official) ──────────────────────────────────

const isGoogleConfigured = !!(process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.includes('XXXX'))
const isFacebookConfigured = !!(process.env.FACEBOOK_APP_ID && !process.env.FACEBOOK_APP_ID.includes('000000000'))

router.get('/google', (req, res, next) => {
  const { role } = req.query
  const currentRole = role || 'parent'

  if (!isGoogleConfigured) {
    return res.redirect(`${CLIENT_URL}/#/masuk?error=${encodeURIComponent('Kredensial Google OAuth (GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET) belum diatur di file .env server.')}`)
  }

  const state = Buffer.from(JSON.stringify({ role: currentRole })).toString('base64')
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state,
    prompt: 'select_account',
  })(req, res, next)
})

router.get('/google/callback', (req, res, next) => {
  if (!isGoogleConfigured) {
    return res.redirect(`${CLIENT_URL}/#/masuk?error=${encodeURIComponent('Google OAuth tidak aktif.')}`)
  }

  passport.authenticate('google', { session: false }, async (err, profile) => {
    if (err) return res.redirect(`${CLIENT_URL}/#/masuk?error=${encodeURIComponent(err.message)}`)
    if (!profile) return res.redirect(`${CLIENT_URL}/#/masuk?error=Login+Google+gagal`)

    const stateRaw = req.query.state
    let role = 'parent'
    try { role = JSON.parse(Buffer.from(stateRaw, 'base64').toString()).role } catch {}

    if (profile.google_pending) {
      // New user via Google - redirect to complete profile registration
      const params = new URLSearchParams({
        provider: 'google',
        email: profile.email,
        name: profile.name,
        provider_id: profile.provider_id,
        role,
      })
      return res.redirect(`${CLIENT_URL}/#/lengkapi?${params.toString()}`)
    }

    // Existing user - log in directly with their registered role
    const activeRole = profile.role || role
    const token = signJwt({ userId: profile.id, role: activeRole })
    res.redirect(`${CLIENT_URL}/#/oauth-success?token=${token}&role=${activeRole}`)
  })(req, res, next)
})

// ─── Facebook OAuth (Official) ────────────────────────────────

router.get('/facebook', (req, res, next) => {
  const { role } = req.query
  const currentRole = role || 'parent'

  if (!isFacebookConfigured) {
    return res.redirect(`${CLIENT_URL}/#/masuk?error=${encodeURIComponent('Kredensial Facebook OAuth (FACEBOOK_APP_ID & FACEBOOK_APP_SECRET) belum diatur di file .env server.')}`)
  }

  const state = Buffer.from(JSON.stringify({ role: currentRole })).toString('base64')
  passport.authenticate('facebook', { scope: ['public_profile', 'email'], state })(req, res, next)
})

router.get('/facebook/callback', (req, res, next) => {
  if (!isFacebookConfigured) {
    return res.redirect(`${CLIENT_URL}/#/masuk?error=${encodeURIComponent('Facebook OAuth tidak aktif.')}`)
  }

  passport.authenticate('facebook', { session: false }, async (err, profile) => {
    if (err) return res.redirect(`${CLIENT_URL}/#/masuk?error=${encodeURIComponent(err.message)}`)
    if (!profile) return res.redirect(`${CLIENT_URL}/#/masuk?error=Login+Facebook+gagal`)

    const stateRaw = req.query.state
    let role = 'parent'
    try { role = JSON.parse(Buffer.from(stateRaw, 'base64').toString()).role } catch {}

    if (profile.facebook_pending) {
      const params = new URLSearchParams({
        provider: 'facebook',
        email: profile.email,
        name: profile.name,
        provider_id: profile.provider_id,
        role,
      })
      return res.redirect(`${CLIENT_URL}/#/lengkapi?${params.toString()}`)
    }

    const activeRole = profile.role || role
    const token = signJwt({ userId: profile.id, role: activeRole })
    res.redirect(`${CLIENT_URL}/#/oauth-success?token=${token}&role=${activeRole}`)
  })(req, res, next)
})

// ─── OAuth status check ───────────────────────────────────────

router.get('/providers', (req, res) => {
  res.json({
    google: isGoogleConfigured,
    facebook: isFacebookConfigured,
  })
})

// ─── Helpers ──────────────────────────────────────────────────

export function safeUser(u) {
  if (!u) return null
  const { password_hash, provider_id, ...safe } = u
  return safe
}

export default router
