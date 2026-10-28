/**
 * Hadirku API Client
 * Menghubungkan frontend ke backend Node.js + MySQL
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const TOKEN_KEY = 'hadirku:token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t: string | null) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)

async function req<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data as T
}

const get = <T>(path: string, auth = true) => req<T>('GET', path, undefined, auth)
const post = <T>(path: string, body: unknown, auth = true) => req<T>('POST', path, body, auth)
const put = <T>(path: string, body: unknown) => req<T>('PUT', path, body)
const del = <T>(path: string) => req<T>('DELETE', path)

// ─── Auth ─────────────────────────────────────────────────────

export const apiLogin = (email: string, password: string, role: string) =>
  post<{ token: string; user: ApiUser }>('/auth/login', { email, password, role }, false)

export const apiRegisterParent = (d: RegisterParentInput) =>
  post<{ token: string; user: ApiUser }>('/auth/register/parent', d, false)

export const apiRegisterStudent = (d: RegisterStudentInput) =>
  post<{ token: string; user: ApiUser }>('/auth/register/student', d, false)

export const apiRegisterTeacher = (d: RegisterTeacherInput) =>
  post<{ token: string; user: ApiUser }>('/auth/register/teacher', d, false)

export const apiGetProviders = () =>
  get<{ google: boolean; facebook: boolean }>('/auth/providers')

// ─── User ─────────────────────────────────────────────────────

export const apiGetMe = () => get<ApiUser>('/api/me')
export const apiUpdateMe = (d: { name: string; email: string; phone: string; avatar?: string }) => put('/api/me', d)
export const apiChangePassword = (current: string, next: string) => post('/api/me/change-password', { current, next })
export const apiUpdatePrefs = (prefs: Record<string, unknown>) => put('/api/me/prefs', prefs)
export const apiTouchDevice = (d: { deviceKey: string; name: string; kind: string; browser: string }) => post('/api/me/touch-device', d)
export const apiRevokeDevice = (deviceKey: string) => del(`/api/me/devices/${deviceKey}`)
export const apiRevokeOtherDevices = (keep: string) => del(`/api/me/devices?keep=${keep}`)

// ─── Sessions ─────────────────────────────────────────────────

export const apiOpenSession = (className: string, subject: string, minutes: number) =>
  post<ApiSession>('/api/sessions', { className, subject, minutes })

export const apiGetActiveSession = () => get<ApiSession | null>('/api/sessions/active')
export const apiCloseSession = (id: string) => post(`/api/sessions/${id}/close`, {})
export const apiGetSessionQr = (id: string) => get<{ token: string; slot: number; slotMs: number; expiresIn: number }>(`/api/sessions/${id}/qr`)
export const apiGetSessionRoster = (id: string) => get<ApiRosterEntry[]>(`/api/sessions/${id}/roster`)
export const apiMarkManual = (sessionId: string, studentId: string, status: string) =>
  post(`/api/sessions/${sessionId}/mark`, { studentId, status })
export const apiCheckin = (token: string, nis: string, selfCheckin = false) =>
  post<{ student: ApiStudent; attendance: ApiAttendance; already: boolean }>('/api/sessions/checkin', { token, nis, selfCheckin }, false)
export const apiGetLiveSession = (className: string) =>
  get<ApiSession | null>(`/api/sessions/live/${encodeURIComponent(className)}`)

// ─── Attendance ───────────────────────────────────────────────

export const apiGetStudentAttendance = (studentId: string, month?: string) =>
  get<ApiAttendance[]>(`/api/attendance/student/${studentId}${month ? `?month=${month}` : ''}`)

export const apiGetClassAttendance = (className: string, month?: string) =>
  get<{ students: ApiStudent[]; attendance: ApiAttendance[] }>(`/api/attendance/class/${encodeURIComponent(className)}${month ? `?month=${month}` : ''}`)

// ─── Leaves ───────────────────────────────────────────────────

export const apiGetLeaves = () => get<ApiLeave[]>('/api/leaves')
export const apiSubmitLeave = (d: { type: string; date: string; reason: string; proofName?: string; proofUrl?: string }) =>
  post<ApiLeave>('/api/leaves', d)
export const apiDecideLeave = (id: string, decision: 'approved' | 'rejected') =>
  put(`/api/leaves/${id}/decide`, { decision })

// ─── Notices ──────────────────────────────────────────────────

export const apiGetNotices = () => get<ApiNotice[]>('/api/notices')
export const apiMarkAllRead = () => post('/api/notices/mark-read', {})

// ─── Students ─────────────────────────────────────────────────

export const apiGetStudents = () => get<ApiStudent[]>('/api/students')
export const apiAddStudent = (nis: string, name: string, className: string) =>
  post<ApiStudent>('/api/students', { nis, name, className })
export const apiDeleteStudent = (id: string) => del(`/api/students/${id}`)

// ─── Schedule ─────────────────────────────────────────────────

export const apiGetSchedule = () => get<ApiSchedule[]>('/api/students/schedule')
export const apiAddSchedule = (d: { day: number; start: string; end: string; className: string; subject: string }) =>
  post<ApiSchedule>('/api/students/schedule', d)
export const apiDeleteSchedule = (id: string) => del(`/api/students/schedule/${id}`)

// ─── OAuth helpers ────────────────────────────────────────────

export const googleLoginUrl = (role: string) => `${API_URL}/auth/google?role=${role}`
export const facebookLoginUrl = (role: string) => `${API_URL}/auth/facebook?role=${role}`

// ─── Types ────────────────────────────────────────────────────

export interface ApiUser {
  id: string
  role: 'parent' | 'teacher' | 'student'
  name: string
  email: string
  phone?: string
  avatar_url?: string
  nip?: string
  subject?: string
  student_id?: string
  provider?: 'google' | 'facebook'
  pass_set?: number
  classes?: string[]
  schedule?: ApiSchedule[]
  prefs?: Record<string, unknown>
  devices?: ApiDevice[]
}

export interface ApiSession {
  id: string
  teacherId: string
  className: string
  subject: string
  startedAt: number
  endsAt: number
  secret: string
  closedAt?: number
}

export interface ApiAttendance {
  id: string
  student_id: string
  session_id: string
  attend_date: string
  status: 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpa'
  time_str: string
  recorded_at: string
  is_manual: number
  is_self: number
  subject?: string
  class_name?: string
}

export interface ApiStudent {
  id: string
  nis: string
  name: string
  class_name: string
  created_at?: string
}

export interface ApiRosterEntry {
  student: ApiStudent
  status: 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpa' | 'belum'
  timeStr: string | null
  isManual?: boolean
  isSelf?: boolean
}

export interface ApiLeave {
  id: string
  student_id: string
  parent_id: string
  leave_type: 'izin' | 'sakit'
  leave_date: string
  reason: string
  proof_name?: string
  proof_url?: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  student_name?: string
  class_name?: string
  nis?: string
}

export interface ApiNotice {
  id: string
  userId: string
  type: 'success' | 'warning' | 'info'
  kind: string
  title: string
  text: string
  at: number
  read: boolean
}

export interface ApiSchedule {
  id: string
  day: number
  start: string
  end: string
  className: string
  subject: string
}

export interface ApiDevice {
  id: string
  name: string
  kind: 'phone' | 'desktop'
  browser: string
  firstSeen: number
  lastActive: number
}

export interface RegisterParentInput {
  name: string; email: string; password?: string
  childName: string; nis: string; className?: string
  provider?: string; providerId?: string
}
export interface RegisterStudentInput {
  name: string; email: string; password?: string; phone?: string; nis: string; className?: string
  provider?: string; providerId?: string
}
export interface RegisterTeacherInput {
  name: string; email: string; password?: string
  nip: string; subject: string; classes: string
  provider?: string; providerId?: string
}

export const apiLookupStudent = (nis: string) =>
  get<{ found: boolean; student?: { id: string; nis: string; name: string; className: string } }>(`/auth/student-lookup?nis=${encodeURIComponent(nis)}`, false)

