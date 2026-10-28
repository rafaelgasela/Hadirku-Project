import { v4 as uuidv4 } from 'uuid'

export const uid = () => uuidv4()

export const dateKey = (d = new Date()) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const timeKey = (d = new Date()) => {
  return d.toTimeString().slice(0, 5)
}

export const SLOT_MS = 30000
export const LATE_AFTER_MIN = 15

export function qrSlot(now = Date.now()) {
  return Math.floor(now / SLOT_MS)
}

export function signToken(secret, sessionId, slot) {
  const str = `${secret}:${sessionId}:${slot}`
  let h = 2166136261
  for (const c of str) {
    h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  }
  return h.toString(36)
}

export function makeQrToken(session, now = Date.now()) {
  const slot = qrSlot(now)
  return `${session.id}.${slot}.${signToken(session.secret, session.id, slot)}`
}

export function readQrToken(token, sessions) {
  const [sid, slotStr, sig] = token.split('.')
  const session = sessions.find(s => s.id === sid)
  if (!session) return { error: 'Kode QR tidak dikenali.' }
  const slot = Number(slotStr)
  if (!sig || signToken(session.secret, session.id, slot) !== sig) return { error: 'Kode QR tidak valid.' }
  const now = Date.now()
  const endsAt = new Date(session.ends_at).getTime()
  const closedAt = session.closed_at ? new Date(session.closed_at).getTime() : null
  if (closedAt || now > endsAt) return { error: 'Sesi absensi sudah ditutup.', session }
  if (qrSlot(now) - slot > 3) return { error: 'Kode QR sudah kedaluwarsa. Scan ulang QR terbaru dari layar guru.', session }
  return { session }
}
