/**
 * HADIRKU - Database Seeder
 * Mengisi database MySQL dengan data demo yang sama dengan data localStorage.
 * Jalankan: node src/seed.js
 */

import bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import pool from './db.js'
import dotenv from 'dotenv'
dotenv.config()

const DEMO = {
  parent: { email: 'rina@hadirku.id', password: 'ortu12345' },
  teacher: { email: 'guru@hadirku.id', password: 'guru12345' },
  student: { email: 'nadia@hadirku.id', password: 'siswa12345' },
}

const roster = [
  ['20250123', 'Nadia Azzahra', 'XI RPL 1'],
  ['20250124', 'Raka Firmansyah', 'XI RPL 1'],
  ['20250125', 'Andini Saputri', 'XI RPL 1'],
  ['20250126', 'Bima Prakoso', 'XI RPL 1'],
  ['20250127', 'Citra Maharani', 'XI RPL 1'],
  ['20250128', 'Dafa Ramadhan', 'XI RPL 1'],
  ['20250129', 'Eka Lestari', 'XI RPL 1'],
  ['20250130', 'Farhan Hidayat', 'XI RPL 1'],
  ['20250231', 'Gita Permata', 'XI RPL 2'],
  ['20250232', 'Hafiz Alamsyah', 'XI RPL 2'],
  ['20250233', 'Intan Purnama', 'XI RPL 2'],
  ['20250234', 'Joko Santoso', 'XI RPL 2'],
]

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

async function seed() {
  console.log('🌱 Memulai seeding database Hadirku...')
  const conn = await pool.getConnection()
  
  try {
    await conn.beginTransaction()

    // Clear existing data
    console.log('   Menghapus data lama...')
    await conn.query('DELETE FROM notices')
    await conn.query('DELETE FROM leaves')
    await conn.query('DELETE FROM attendance')
    await conn.query('DELETE FROM sessions')
    await conn.query('DELETE FROM devices')
    await conn.query('DELETE FROM notification_prefs')
    await conn.query('DELETE FROM teacher_schedules')
    await conn.query('DELETE FROM teacher_classes')
    await conn.query('DELETE FROM users')
    await conn.query('DELETE FROM students')

    // Insert students
    console.log('   Menambahkan data siswa...')
    const studentIds = {}
    for (const [i, [nis, name, className]] of roster.entries()) {
      const id = uuidv4()
      studentIds[nis] = id
      await conn.query(
        'INSERT INTO students (id, nis, name, class_name) VALUES (?,?,?,?)',
        [id, nis, name, className]
      )
    }

    // Insert users
    console.log('   Menambahkan akun demo...')
    const parentHash = await bcrypt.hash(DEMO.parent.password, 12)
    const teacherHash = await bcrypt.hash(DEMO.teacher.password, 12)
    const studentHash = await bcrypt.hash(DEMO.student.password, 12)

    const parentId = uuidv4()
    const teacherId = uuidv4()
    const studentUserId = uuidv4()
    const nadiaStuId = studentIds['20250123']

    await conn.query(
      'INSERT INTO users (id, role, name, email, password_hash, student_id) VALUES (?,?,?,?,?,?)',
      [parentId, 'parent', 'Rina Andriani', DEMO.parent.email, parentHash, nadiaStuId]
    )
    await conn.query(
      'INSERT INTO users (id, role, name, email, password_hash, nip, subject) VALUES (?,?,?,?,?,?,?)',
      [teacherId, 'teacher', 'Dimas Pratama, S.Kom', DEMO.teacher.email, teacherHash, '198708122015021003', 'Pemrograman Web']
    )
    await conn.query(
      'INSERT INTO users (id, role, name, email, password_hash, student_id) VALUES (?,?,?,?,?,?)',
      [studentUserId, 'student', 'Nadia Azzahra', DEMO.student.email, studentHash, nadiaStuId]
    )

    // Teacher classes
    await conn.query('INSERT INTO teacher_classes (teacher_id, class_name) VALUES (?,?)', [teacherId, 'XI RPL 1'])
    await conn.query('INSERT INTO teacher_classes (teacher_id, class_name) VALUES (?,?)', [teacherId, 'XI RPL 2'])

    // Teacher schedule
    const schedules = [
      [1, '07:15:00', '08:45:00', 'XI RPL 1', 'Pemrograman Web'],
      [1, '09:00:00', '10:30:00', 'XI RPL 2', 'Basis Data'],
      [2, '07:15:00', '08:45:00', 'XI RPL 2', 'Basis Data'],
      [3, '07:15:00', '08:45:00', 'XI RPL 1', 'Pemrograman Web'],
      [3, '10:45:00', '12:15:00', 'XI RPL 2', 'Pemrograman Web'],
      [4, '09:00:00', '10:30:00', 'XI RPL 1', 'Pemrograman Web'],
      [5, '07:15:00', '08:45:00', 'XI RPL 2', 'Basis Data'],
    ]
    for (const [day, start, end, className, subject] of schedules) {
      await conn.query(
        'INSERT INTO teacher_schedules (id, teacher_id, day_of_week, start_time, end_time, class_name, subject) VALUES (?,?,?,?,?,?,?)',
        [uuidv4(), teacherId, day, start, end, className, subject]
      )
    }

    // Notification prefs
    await conn.query('INSERT INTO notification_prefs (user_id) VALUES (?)', [parentId])
    await conn.query('INSERT INTO notification_prefs (user_id) VALUES (?)', [teacherId])
    await conn.query('INSERT INTO notification_prefs (user_id) VALUES (?)', [studentUserId])

    // Generate past sessions and attendance (last 24 working days)
    console.log('   Membuat data sesi dan kehadiran historis...')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let n = 0

    for (let back = 1; back <= 24; back++) {
      const d = new Date(today)
      d.setDate(d.getDate() - back)
      if (d.getDay() === 0 || d.getDay() === 6) continue

      for (const className of ['XI RPL 1', 'XI RPL 2']) {
        const sessionId = uuidv4()
        const start = new Date(d)
        start.setHours(7, 15, 0, 0)
        const end = new Date(start.getTime() + 90 * 60000)
        const subject = className === 'XI RPL 1' ? 'Pemrograman Web' : 'Basis Data'

        await conn.query(
          'INSERT INTO sessions (id, teacher_id, class_name, subject, started_at, ends_at, secret, closed_at) VALUES (?,?,?,?,?,?,?,?)',
          [sessionId, teacherId, className, subject, start, end, 'seed', end]
        )

        const classStudents = roster.filter(r => r[2] === className)
        for (const [idx, [nis, name]] of classStudents.entries()) {
          n++
          const roll = (n * 7 + idx * 3 + back * 5) % 23
          let status = 'hadir'
          if (roll === 4 || roll === 15) status = 'terlambat'
          else if (roll === 9) status = 'izin'
          else if (roll === 20) status = 'alpa'
          else if (roll === 12) status = 'sakit'

          const mins = status === 'terlambat' ? 20 + (roll % 7) : status === 'hadir' ? (roll % 12) - 4 : 0
          const at = new Date(start.getTime() + mins * 60000)
          const timeStr = (status === 'izin' || status === 'sakit' || status === 'alpa')
            ? '—'
            : `${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')}`

          await conn.query(
            'INSERT INTO attendance (id, student_id, session_id, attend_date, status, time_str, recorded_at) VALUES (?,?,?,?,?,?,?)',
            [uuidv4(), studentIds[nis], sessionId, dateKey(d), status, timeStr, at]
          )
        }
      }
    }

    // Welcome notice for parent
    await conn.query(
      'INSERT INTO notices (id, user_id, notice_type, kind, title, notice_text) VALUES (?,?,?,?,?,?)',
      [uuidv4(), parentId, 'info', 'info', 'Selamat datang di Hadirku',
        'Anda akan menerima kabar otomatis saat Nadia check-in, terlambat, atau tidak hadir.']
    )

    await conn.commit()
    console.log('✅ Seeding selesai!')
    console.log('')
    console.log('📋 Akun Demo:')
    console.log(`   👨‍👩‍👧 Orang Tua  : ${DEMO.parent.email} / ${DEMO.parent.password}`)
    console.log(`   👨‍🏫 Guru       : ${DEMO.teacher.email} / ${DEMO.teacher.password}`)
    console.log(`   🎓 Siswa      : ${DEMO.student.email} / ${DEMO.student.password}`)
  } catch (err) {
    await conn.rollback()
    console.error('❌ Error saat seeding:', err.message)
    throw err
  } finally {
    conn.release()
    await pool.end()
  }
}

seed().catch(() => process.exit(1))
