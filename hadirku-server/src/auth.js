import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()

const SECRET = process.env.JWT_SECRET || 'hadirku_secret'
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d'

export const signJwt = (payload) => jwt.sign(payload, SECRET, { expiresIn: EXPIRES })

export const verifyJwt = (token) => {
  try {
    return jwt.verify(token, SECRET)
  } catch {
    return null
  }
}

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ditemukan.' })
  }
  const token = auth.slice(7)
  const payload = verifyJwt(token)
  if (!payload) return res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' })
  req.userId = payload.userId
  req.userRole = payload.role
  next()
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Akses ditolak.' })
    }
    next()
  }
}
