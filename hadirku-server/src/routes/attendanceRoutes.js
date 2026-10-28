import { Router } from 'express'
import pool from '../db.js'
import { authMiddleware, requireRole } from '../auth.js'
import { uid } from '../util.js'

const router = Router()

// GET /api/attendance/student/:studentId?month=YYYY-MM
router.get('/student/:studentId', authMiddleware, async (req, res) => {
  const { month } = req.query
  try {
    let query = 'SELECT a.*, s.subject, s.class_name FROM attendance a LEFT JOIN sessions s ON a.session_id = s.id WHERE a.student_id = ?'
    const params = [req.params.studentId]
    if (month) {
      query += ' AND DATE_FORMAT(a.attend_date, "%Y-%m") = ?'
      params.push(month)
    }
    query += ' ORDER BY a.attend_date DESC, a.recorded_at DESC'
    const [rows] = await pool.query(query, params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/attendance/class/:className?month=YYYY-MM
router.get('/class/:className', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { month } = req.query
  try {
    const [students] = await pool.query('SELECT * FROM students WHERE class_name = ? ORDER BY name', [req.params.className])
    const ids = students.map(s => s.id)
    if (!ids.length) return res.json([])

    let query = `SELECT a.* FROM attendance a WHERE a.student_id IN (${ids.map(() => '?').join(',')})`
    const params = [...ids]
    if (month) {
      query += ' AND DATE_FORMAT(a.attend_date, "%Y-%m") = ?'
      params.push(month)
    }
    const [att] = await pool.query(query, params)
    res.json({ students, attendance: att })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/attendance/report/teacher - full report for all classes
router.get('/report/teacher', authMiddleware, requireRole('teacher'), async (req, res) => {
  const { month } = req.query
  try {
    const [classes] = await pool.query('SELECT class_name FROM teacher_classes WHERE teacher_id = ?', [req.userId])
    const result = []
    for (const { class_name } of classes) {
      const [students] = await pool.query('SELECT * FROM students WHERE class_name = ? ORDER BY name', [class_name])
      const ids = students.map(s => s.id)
      let att = []
      if (ids.length) {
        let q = `SELECT * FROM attendance WHERE student_id IN (${ids.map(() => '?').join(',')})`
        const params = [...ids]
        if (month) { q += ' AND DATE_FORMAT(attend_date, "%Y-%m") = ?'; params.push(month) }
        const [rows] = await pool.query(q, params)
        att = rows
      }
      result.push({ class_name, students, attendance: att })
    }
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
