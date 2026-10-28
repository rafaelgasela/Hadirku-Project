import express from 'express'
import cors from 'cors'
import session from 'express-session'
import passport from 'passport'
import dotenv from 'dotenv'

dotenv.config()

import authRoutes from './routes/authRoutes.js'
import userRoutes from './routes/userRoutes.js'
import sessionRoutes from './routes/sessionRoutes.js'
import attendanceRoutes from './routes/attendanceRoutes.js'
import leaveRoutes from './routes/leaveRoutes.js'
import noticeRoutes from './routes/noticeRoutes.js'
import studentRoutes from './routes/studentRoutes.js'
import pool from './db.js'

const app = express()
const PORT = process.env.PORT || 3001

// ─── Middleware ───────────────────────────────────────────────

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.use(session({
  secret: process.env.SESSION_SECRET || 'hadirku_session',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
}))

app.use(passport.initialize())
app.use(passport.session())

// ─── Routes ───────────────────────────────────────────────────

app.use('/auth', authRoutes)
app.use('/api', userRoutes)
app.use('/api/sessions', sessionRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/leaves', leaveRoutes)
app.use('/api/notices', noticeRoutes)
app.use('/api/students', studentRoutes)

// Health check
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }))

// 404
app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }))

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message)
  res.status(500).json({ error: err.message || 'Terjadi kesalahan server.' })
})

// ─── Start ────────────────────────────────────────────────────

async function start() {
  try {
    const conn = await pool.getConnection()
    await conn.ping()
    conn.release()
    console.log('✅ Database MySQL terhubung.')
  } catch (err) {
    console.error('❌ Gagal konek ke database:', err.message)
    console.error('   Pastikan MySQL Laragon berjalan dan database "hadirku_db" sudah dibuat.')
    console.error('   Jalankan schema.sql terlebih dahulu di phpMyAdmin.')
    process.exit(1)
  }

  app.listen(PORT, () => {
    console.log(`🚀 Hadirku Server berjalan di http://localhost:${PORT}`)
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log(`   Google OAuth: ${process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.includes('XXXX') ? '✅ Aktif' : '⚠️  Belum dikonfigurasi'}`)
    console.log(`   Facebook OAuth: ${process.env.FACEBOOK_APP_ID && !process.env.FACEBOOK_APP_ID.includes('000000000') ? '✅ Aktif' : '⚠️  Belum dikonfigurasi'}`)
  })
}

start()
