-- Hadirku: Sistem Absensi Digital Anti-Bolos
-- Skema PostgreSQL 14+ yang memetakan data aplikasi (src/lib/types.ts).
-- Aplikasi saat ini menyimpan data di localStorage; skema ini adalah target
-- saat berpindah ke backend sungguhan.
--
-- Catatan: password disimpan sebagai hash (argon2/bcrypt) di password_hash,
-- foto profil & bukti izin sebaiknya disimpan di object storage (kolom *_url).

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- email tidak peka huruf besar/kecil

-- ---------- tipe enum ----------
CREATE TYPE user_role      AS ENUM ('parent', 'teacher', 'student');
CREATE TYPE auth_provider  AS ENUM ('google', 'facebook');
CREATE TYPE attend_status  AS ENUM ('hadir', 'terlambat', 'izin', 'sakit', 'alpa');
CREATE TYPE leave_type     AS ENUM ('izin', 'sakit');
CREATE TYPE leave_status   AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE notice_type    AS ENUM ('success', 'warning', 'info');
CREATE TYPE notice_kind    AS ENUM ('reminder', 'checkin', 'late', 'absent', 'leave', 'session', 'info');
CREATE TYPE device_kind    AS ENUM ('phone', 'desktop');

-- ---------- siswa ----------
CREATE TABLE students (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nis         text NOT NULL UNIQUE,
  name        text NOT NULL,
  class_name  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX students_class_idx ON students (class_name);

-- ---------- pengguna (orang tua, guru, siswa) ----------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role           user_role NOT NULL,
  name           text NOT NULL,
  email          citext NOT NULL UNIQUE,
  password_hash  text,                       -- NULL bila hanya login sosial
  pass_set       boolean NOT NULL DEFAULT true,  -- false = akun sosial belum membuat password
  provider       auth_provider,
  phone          text,
  avatar_url     text,
  nip            text UNIQUE,                -- khusus guru
  subject        text,                       -- khusus guru: mata pelajaran utama
  student_id     uuid REFERENCES students(id) ON DELETE SET NULL,
                                             -- orang tua: anaknya; siswa: data dirinya
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_has_nip CHECK (role <> 'teacher' OR nip IS NOT NULL),
  CONSTRAINT student_has_record CHECK (role <> 'student' OR student_id IS NOT NULL)
);
CREATE INDEX users_role_idx    ON users (role);
CREATE INDEX users_student_idx ON users (student_id);
-- satu siswa hanya boleh punya satu akun login siswa
CREATE UNIQUE INDEX users_one_student_login ON users (student_id) WHERE role = 'student';

-- kelas yang diampu guru
CREATE TABLE teacher_classes (
  teacher_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_name  text NOT NULL,
  PRIMARY KEY (teacher_id, class_name)
);

-- ---------- jadwal mengajar ----------
CREATE TABLE teacher_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0 = Minggu, 1 = Senin
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  class_name  text NOT NULL,
  subject     text NOT NULL,
  CONSTRAINT schedule_time_order CHECK (end_time > start_time)
);
CREATE INDEX teacher_schedules_idx ON teacher_schedules (teacher_id, day_of_week, start_time);

-- ---------- preferensi notifikasi (1 baris per pengguna) ----------
CREATE TABLE notification_prefs (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push        boolean NOT NULL DEFAULT false,   -- notifikasi di panel HP
  checkin     boolean NOT NULL DEFAULT true,
  late        boolean NOT NULL DEFAULT true,
  absent      boolean NOT NULL DEFAULT true,
  leave       boolean NOT NULL DEFAULT true,
  session     boolean NOT NULL DEFAULT true,
  reminder    boolean NOT NULL DEFAULT true,    -- pengingat jadwal mengajar (guru)
  preview     boolean NOT NULL DEFAULT true,
  sound       boolean NOT NULL DEFAULT true,
  quiet       boolean NOT NULL DEFAULT false,   -- jangan ganggu
  quiet_from  time NOT NULL DEFAULT '21:00',
  quiet_to    time NOT NULL DEFAULT '05:30'
);

-- ---------- perangkat yang sedang masuk ----------
CREATE TABLE devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,                   -- mis. "Android · Chrome"
  kind         device_kind NOT NULL,
  browser      text NOT NULL,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_active  timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz                      -- diisi saat "Keluarkan"
);
CREATE INDEX devices_user_idx ON devices (user_id) WHERE revoked_at IS NULL;

-- ---------- sesi absensi (QR) ----------
CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_name  text NOT NULL,
  subject     text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz NOT NULL,
  secret      text NOT NULL,                    -- dasar token QR yang berputar
  closed_at   timestamptz,
  CONSTRAINT session_window CHECK (ends_at > started_at)
);
CREATE INDEX sessions_teacher_idx ON sessions (teacher_id, started_at DESC);
CREATE INDEX sessions_class_idx   ON sessions (class_name, started_at DESC);

-- ---------- catatan kehadiran ----------
CREATE TABLE attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  date        date NOT NULL,
  status      attend_status NOT NULL,
  time        time NOT NULL,                    -- jam tercatat
  at          timestamptz NOT NULL DEFAULT now(),
  manual      boolean NOT NULL DEFAULT false,   -- diubah manual oleh guru
  self        boolean NOT NULL DEFAULT false,   -- siswa scan sendiri dari akunnya
  UNIQUE (student_id, session_id)               -- satu catatan per siswa per sesi
);
CREATE INDEX attendance_student_date_idx ON attendance (student_id, date DESC);
CREATE INDEX attendance_session_idx      ON attendance (session_id);

-- ---------- pengajuan izin / sakit ----------
CREATE TABLE leaves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        leave_type NOT NULL,
  date        date NOT NULL,
  reason      text NOT NULL,
  proof_name  text,
  proof_url   text,                             -- lampiran di object storage
  status      leave_status NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leaves_student_idx ON leaves (student_id, date DESC);
CREATE INDEX leaves_pending_idx ON leaves (status) WHERE status = 'pending';

-- ---------- notifikasi dalam aplikasi ----------
CREATE TABLE notices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notice_type NOT NULL DEFAULT 'info',
  kind        notice_kind NOT NULL DEFAULT 'info',
  title       text NOT NULL,
  text        text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  read        boolean NOT NULL DEFAULT false
);
CREATE INDEX notices_user_idx   ON notices (user_id, at DESC);
CREATE INDEX notices_unread_idx ON notices (user_id) WHERE read = false;
