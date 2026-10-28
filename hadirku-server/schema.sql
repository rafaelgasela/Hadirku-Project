-- ============================================================
-- HADIRKU DATABASE - MySQL Schema
-- Sistem Absensi Digital Anti-Bolos
-- Dikonversi dari PostgreSQL ke MySQL untuk Laragon
-- 
-- Cara menjalankan:
-- 1. Buka phpMyAdmin (http://localhost/phpmyadmin)
-- 2. Import file ini, ATAU
-- 3. Jalankan: mysql -u root hadirku_db < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS hadirku_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hadirku_db;

-- ---------- siswa ----------
CREATE TABLE IF NOT EXISTS students (
  id          VARCHAR(36)  PRIMARY KEY,
  nis         VARCHAR(50)  NOT NULL UNIQUE,
  name        VARCHAR(200) NOT NULL,
  class_name  VARCHAR(100) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_students_class (class_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- pengguna ----------
CREATE TABLE IF NOT EXISTS users (
  id             VARCHAR(36)  PRIMARY KEY,
  role           ENUM('parent','teacher','student') NOT NULL,
  name           VARCHAR(200) NOT NULL,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255),
  pass_set       TINYINT(1)   NOT NULL DEFAULT 1,
  provider       ENUM('google','facebook'),
  provider_id    VARCHAR(255),
  phone          VARCHAR(30),
  avatar_url     TEXT,
  nip            VARCHAR(100),
  subject        VARCHAR(200),
  student_id     VARCHAR(36),
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  INDEX idx_users_role    (role),
  INDEX idx_users_student (student_id),
  INDEX idx_users_provider (provider, provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- kelas yang diampu guru ----------
CREATE TABLE IF NOT EXISTS teacher_classes (
  teacher_id  VARCHAR(36)  NOT NULL,
  class_name  VARCHAR(100) NOT NULL,
  PRIMARY KEY (teacher_id, class_name),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- jadwal mengajar ----------
CREATE TABLE IF NOT EXISTS teacher_schedules (
  id          VARCHAR(36)  PRIMARY KEY,
  teacher_id  VARCHAR(36)  NOT NULL,
  day_of_week TINYINT      NOT NULL,
  start_time  TIME         NOT NULL,
  end_time    TIME         NOT NULL,
  class_name  VARCHAR(100) NOT NULL,
  subject     VARCHAR(200) NOT NULL,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_schedules_teacher (teacher_id, day_of_week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- preferensi notifikasi ----------
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id       VARCHAR(36)  PRIMARY KEY,
  push_notif    TINYINT(1)   NOT NULL DEFAULT 0,
  notif_checkin TINYINT(1)   NOT NULL DEFAULT 1,
  notif_late    TINYINT(1)   NOT NULL DEFAULT 1,
  notif_absent  TINYINT(1)   NOT NULL DEFAULT 1,
  notif_leave   TINYINT(1)   NOT NULL DEFAULT 1,
  notif_session TINYINT(1)   NOT NULL DEFAULT 1,
  notif_reminder TINYINT(1)  NOT NULL DEFAULT 1,
  preview       TINYINT(1)   NOT NULL DEFAULT 1,
  sound         TINYINT(1)   NOT NULL DEFAULT 1,
  quiet_mode    TINYINT(1)   NOT NULL DEFAULT 0,
  quiet_from    TIME         NOT NULL DEFAULT '21:00:00',
  quiet_to      TIME         NOT NULL DEFAULT '05:30:00',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- perangkat ----------
CREATE TABLE IF NOT EXISTS devices (
  id           VARCHAR(36)  PRIMARY KEY,
  user_id      VARCHAR(36)  NOT NULL,
  device_key   VARCHAR(100) NOT NULL,
  name         VARCHAR(200) NOT NULL,
  kind         ENUM('phone','desktop') NOT NULL,
  browser      VARCHAR(100) NOT NULL,
  first_seen   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  revoked_at   DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_device (user_id, device_key),
  INDEX idx_devices_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- sesi absensi (QR) ----------
CREATE TABLE IF NOT EXISTS sessions (
  id          VARCHAR(36)  PRIMARY KEY,
  teacher_id  VARCHAR(36)  NOT NULL,
  class_name  VARCHAR(100) NOT NULL,
  subject     VARCHAR(200) NOT NULL,
  started_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at     DATETIME     NOT NULL,
  secret      VARCHAR(100) NOT NULL,
  closed_at   DATETIME,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_teacher (teacher_id),
  INDEX idx_sessions_class   (class_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- catatan kehadiran ----------
CREATE TABLE IF NOT EXISTS attendance (
  id          VARCHAR(36)  PRIMARY KEY,
  student_id  VARCHAR(36)  NOT NULL,
  session_id  VARCHAR(36)  NOT NULL,
  attend_date DATE         NOT NULL,
  status      ENUM('hadir','terlambat','izin','sakit','alpa') NOT NULL,
  time_str    VARCHAR(10)  NOT NULL DEFAULT '--:--',
  recorded_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_manual   TINYINT(1)   NOT NULL DEFAULT 0,
  is_self     TINYINT(1)   NOT NULL DEFAULT 0,
  UNIQUE KEY unique_student_session (student_id, session_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  INDEX idx_attendance_student (student_id, attend_date DESC),
  INDEX idx_attendance_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- pengajuan izin / sakit ----------
CREATE TABLE IF NOT EXISTS leaves (
  id          VARCHAR(36)  PRIMARY KEY,
  student_id  VARCHAR(36)  NOT NULL,
  parent_id   VARCHAR(36)  NOT NULL,
  leave_type  ENUM('izin','sakit') NOT NULL,
  leave_date  DATE         NOT NULL,
  reason      TEXT         NOT NULL,
  proof_name  VARCHAR(255),
  proof_url   TEXT,
  status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id)  REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_leaves_student (student_id),
  INDEX idx_leaves_pending (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- notifikasi dalam aplikasi ----------
CREATE TABLE IF NOT EXISTS notices (
  id           VARCHAR(36)  PRIMARY KEY,
  user_id      VARCHAR(36)  NOT NULL,
  notice_type  ENUM('success','warning','info') NOT NULL DEFAULT 'info',
  kind         ENUM('reminder','checkin','late','absent','leave','session','info') NOT NULL DEFAULT 'info',
  title        VARCHAR(255) NOT NULL,
  notice_text  TEXT         NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_read      TINYINT(1)   NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notices_user   (user_id),
  INDEX idx_notices_unread (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
