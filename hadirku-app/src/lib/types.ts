export type Role = "parent" | "teacher" | "student"
export type Status = "hadir" | "terlambat" | "izin" | "sakit" | "alpa"

export interface User {
  id: string
  role: Role
  name: string
  email: string
  passHash?: string
  provider?: "google" | "facebook"
  studentId?: string
  student_id?: string
  nip?: string
  subject?: string
  classes?: string[]
  phone?: string
  avatar?: string
  avatar_url?: string
  passSet?: boolean
  pass_set?: number
  prefs?: NotifPrefs | any
  devices?: Device[] | any[]
  schedule?: ScheduleItem[] | any[]
}

export interface ScheduleItem {
  id: string
  day: number
  start: string
  end: string
  className: string
  subject: string
}

export interface NotifPrefs {
  reminder: boolean
  push: boolean
  checkin: boolean
  late: boolean
  absent: boolean
  leave: boolean
  session: boolean
  preview: boolean
  sound: boolean
  quiet: boolean
  quietFrom: string
  quietTo: string
}

export interface Device {
  id: string
  name: string
  kind: "phone" | "desktop"
  browser: string
  firstSeen: number
  lastActive: number
}

export interface Student {
  id: string
  nis: string
  name: string
  className: string
}

export interface Session {
  id: string
  teacherId: string
  className: string
  subject: string
  startedAt: number
  endsAt: number
  secret: string
  closedAt?: number
}

export interface Attendance {
  id: string
  studentId: string
  date: string
  sessionId: string
  status: Status
  time: string
  at: number
  manual?: boolean
  self?: boolean
}

export interface Leave {
  id: string
  studentId: string
  parentId: string
  type: "izin" | "sakit"
  date: string
  reason: string
  proofName?: string
  proofData?: string
  status: "pending" | "approved" | "rejected"
  createdAt: number
}

export interface Notice {
  id: string
  userId: string
  type: "success" | "warning" | "info"
  title: string
  text: string
  at: number
  read: boolean
  kind?: NoticeKind
}

export type NoticeKind = "reminder" | "checkin" | "late" | "absent" | "leave" | "session" | "info"

export interface DB {
  users: User[]
  students: Student[]
  sessions: Session[]
  attendance: Attendance[]
  leaves: Leave[]
  notices: Notice[]
}
