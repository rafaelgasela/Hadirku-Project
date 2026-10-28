import type { Attendance, DB, Session, Status, Student } from "./types"
import { dateKey, hashPassword } from "./util"

export const DEMO = {
  parent: { email: "rina@hadirku.id", password: "ortu12345" },
  teacher: { email: "guru@hadirku.id", password: "guru12345" },
  student: { email: "nadia@hadirku.id", password: "siswa12345" },
}

const roster: [string, string, string][] = [
  ["20250123", "Nadia Azzahra", "XI RPL 1"],
  ["20250124", "Raka Firmansyah", "XI RPL 1"],
  ["20250125", "Andini Saputri", "XI RPL 1"],
  ["20250126", "Bima Prakoso", "XI RPL 1"],
  ["20250127", "Citra Maharani", "XI RPL 1"],
  ["20250128", "Dafa Ramadhan", "XI RPL 1"],
  ["20250129", "Eka Lestari", "XI RPL 1"],
  ["20250130", "Farhan Hidayat", "XI RPL 1"],
  ["20250231", "Gita Permata", "XI RPL 2"],
  ["20250232", "Hafiz Alamsyah", "XI RPL 2"],
  ["20250233", "Intan Purnama", "XI RPL 2"],
  ["20250234", "Joko Santoso", "XI RPL 2"],
]

export function createSeed(): DB {
  const students: Student[] = roster.map(([nis, name, className], i) => ({
    id: "stu_" + (i + 1),
    nis,
    name,
    className,
  }))
  const sessions: Session[] = []
  const attendance: Attendance[] = []

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let n = 0
  for (let back = 1; back <= 24; back++) {
    const d = new Date(today)
    d.setDate(d.getDate() - back)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    for (const className of ["XI RPL 1", "XI RPL 2"]) {
      const sid = "ses_seed_" + dateKey(d) + className.slice(-1)
      const start = new Date(d)
      start.setHours(7, 15, 0, 0)
      sessions.push({
        id: sid,
        teacherId: "usr_teacher",
        className,
        subject: className === "XI RPL 1" ? "Pemrograman Web" : "Basis Data",
        startedAt: start.getTime(),
        endsAt: start.getTime() + 90 * 60000,
        secret: "seed",
        closedAt: start.getTime() + 90 * 60000,
      })
      students
        .filter((s) => s.className === className)
        .forEach((s, idx) => {
          n++
          const roll = (n * 7 + idx * 3 + back * 5) % 23
          let status: Status = "hadir"
          if (roll === 4 || roll === 15) status = "terlambat"
          else if (roll === 9) status = "izin"
          else if (roll === 20) status = "alpa"
          else if (roll === 12) status = "sakit"
          const mins = status === "terlambat" ? 20 + (roll % 7) : status === "hadir" ? (roll % 12) - 4 : 0
          const at = new Date(start.getTime() + mins * 60000)
          attendance.push({
            id: `att_seed_${n}`,
            studentId: s.id,
            date: dateKey(d),
            sessionId: sid,
            status,
            time: status === "izin" || status === "sakit" || status === "alpa" ? "—" : `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
            at: at.getTime(),
          })
        })
    }
  }

  return {
    users: [
      {
        id: "usr_parent",
        role: "parent",
        name: "Rina Andriani",
        email: DEMO.parent.email,
        passHash: hashPassword(DEMO.parent.password),
        studentId: "stu_1",
      },
      {
        id: "usr_student",
        role: "student",
        name: "Nadia Azzahra",
        email: DEMO.student.email,
        passHash: hashPassword(DEMO.student.password),
        studentId: "stu_1",
      },
      {
        id: "usr_teacher",
        role: "teacher",
        name: "Dimas Pratama, S.Kom",
        email: DEMO.teacher.email,
        passHash: hashPassword(DEMO.teacher.password),
        nip: "198708122015021003",
        subject: "Pemrograman Web",
        classes: ["XI RPL 1", "XI RPL 2"],
        schedule: [
          [1, "07:15", "08:45", "XI RPL 1", "Pemrograman Web"],
          [1, "09:00", "10:30", "XI RPL 2", "Basis Data"],
          [2, "07:15", "08:45", "XI RPL 2", "Basis Data"],
          [3, "07:15", "08:45", "XI RPL 1", "Pemrograman Web"],
          [3, "10:45", "12:15", "XI RPL 2", "Pemrograman Web"],
          [4, "09:00", "10:30", "XI RPL 1", "Pemrograman Web"],
          [5, "07:15", "08:45", "XI RPL 2", "Basis Data"],
        ].map(([day, start, end, className, subject], i) => ({ id: "sch_" + i, day: day as number, start: start as string, end: end as string, className: className as string, subject: subject as string })),
      },
    ],
    students,
    sessions,
    attendance,
    leaves: [],
    notices: [
      {
        id: "ntc_seed",
        userId: "usr_parent",
        type: "info",
        title: "Selamat datang di Hadirku",
        text: "Anda akan menerima kabar otomatis saat Nadia check-in, terlambat, atau tidak hadir.",
        at: Date.now() - 3600000,
        read: false,
      },
    ],
  }
}
