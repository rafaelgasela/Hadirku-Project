# Hadirku — Sistem Absensi Digital Anti-Bolos

Aplikasi web (React + Vite + TypeScript + Tailwind CSS v4) untuk tiga peran:

- **Siswa**: daftar/masuk dengan email + password atau **Google/Facebook** (simulasi; akun baru diarahkan ke halaman **Lengkapi profil siswa**: nama, email, NIS, telepon opsional), scan QR guru lewat kamera (atau tempel tautan), lihat status & riwayat. Setiap check-in otomatis masuk ke notifikasi orang tua yang terhubung dengan NIS yang sama. Di **Akun**: data pribadi, pengaturan notifikasi (sesi absensi dibuka, status kehadiran diperbarui), dan keamanan akun, sama seperti orang tua.
- **Orang tua**: pantau status kehadiran anak real-time, notifikasi, riwayat per bulan (unduh CSV), ajukan izin/sakit dengan lampiran. Di **Akun**: data pribadi (foto, nama, email, telepon), pengaturan notifikasi panel HP (izin Notification API, jenis kabar, jam jangan ganggu), dan keamanan (daftar perangkat masuk + keluarkan, ganti password).
- **Guru**: buka sesi absensi QR (kode berganti tiap 30 detik), pantau siswa yang sudah scan, tandai manual (Hadir/Izin/Sakit), kelola siswa per kelas, tinjau & setujui izin (tab Menunggu/Semua, foto bukti dari orang tua bisa dilihat penuh), unduh laporan CSV. Di **Akun**: data pribadi, jadwal mengajar, pengaturan notifikasi, dan keamanan akun.

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # hasil di dist/
```

## Akun demo

| Peran | Email | Password |
| --- | --- | --- |
| Siswa (Nadia Azzahra) | nadia@hadirku.id | siswa12345 |
| Orang tua (anak: Nadia Azzahra, NIS 20250123) | rina@hadirku.id | ortu12345 |
| Guru (XI RPL 1, XI RPL 2) | guru@hadirku.id | guru12345 |

NIS siswa demo: 20250123–20250130 (XI RPL 1), 20250231–20250234 (XI RPL 2).

## Alur uji cepat

1. Masuk sebagai Guru → **Sesi QR** → *Mulai sesi absensi*.
2. Di tab lain masuk sebagai Siswa → **Scan QR** (kamera atau tempel tautan) → kehadiran tercatat (tanpa akun, QR juga bisa dibuka lewat **Buka check-in** + NIS).
3. Di tab lain masuk sebagai Orang tua → status anak & notifikasi langsung berubah.
4. Orang tua ajukan izin dengan lampiran foto → Guru membuka **Akun → Pengajuan izin**, ketuk *Lihat bukti*, lalu setujui/tolak.
5. Guru menutup sesi → siswa yang belum scan otomatis tercatat tidak hadir & orang tua diberi tahu.

## Struktur

```
src/
  lib/        store (data, aksi, aturan absensi), seed, router hash, util
  components/ Icon, Brand, BottomNav, QrCode, hooks
  screens/    Splash, Auth, Complete (lengkapi profil sosial), Checkin,
              Parent, Student, Teacher,
              ParentAccount (Data pribadi, Notifikasi, Keamanan; dipakai ketiga peran),
              TeacherSchedule (jadwal mengajar)
schema.sql    skema database PostgreSQL acuan untuk backend
```

## Peta rute (hash router)

| Peran | Rute |
| --- | --- |
| Umum | `/masuk`, `/lengkapi`, `/checkin` |
| Siswa | `/siswa`, `/siswa/scan`, `/siswa/riwayat`, `/siswa/akun`, `/siswa/akun/{data,notifikasi,keamanan}` |
| Orang tua | `/ortu`, `/ortu/riwayat`, `/ortu/izin`, `/ortu/notifikasi`, `/ortu/akun`, `/ortu/akun/{data,notifikasi,keamanan}` |
| Guru | `/guru`, `/guru/qr`, `/guru/kelas`, `/guru/laporan`, `/guru/izin`, `/guru/akun`, `/guru/akun/{data,jadwal,notifikasi,keamanan}` |

Halaman akun (`ParentAccount.tsx`) menyesuaikan teks, menu notifikasi, dan tujuan tombol kembali berdasarkan `user.role`. Untuk menambah peran baru cukup tambahkan baris di `baseOf`, `kickerOf`, dan daftar `*_ROWS`.

## Model data (`src/lib/types.ts`)

`User` (role parent/teacher/student, prefs, devices, schedule), `Student`, `Session`, `Attendance`, `Leave` (bukti disimpan sebagai data URL), `Notice` (dengan `kind` untuk filter preferensi). Semuanya punya padanan tabel di `schema.sql`.

## Catatan penting

- Scan kamera butuh HTTPS atau localhost; di luar itu pakai tautan QR. Satu NIS hanya boleh punya satu akun siswa.
- **Data tersimpan di `localStorage` browser** (sinkron antar tab; login per tab). Belum ada server,
  jadi data tidak dibagi antar perangkat. Untuk produksi, ganti `src/lib/store.ts` dengan API + database
  (skema acuan PostgreSQL: `schema.sql`).
- **Login Google/Facebook masih simulasi** (tanpa OAuth). Integrasikan Google Identity / Facebook Login
  di `SocialSheet` (`src/screens/Auth.tsx`) dan verifikasi token di server.
- Daftar perangkat hanya mencakup browser yang login pada penyimpanan yang sama; notifikasi panel HP hanya muncul selama browser berjalan (belum ada push server/service worker).
- Password di-hash SHA-256 di sisi klien hanya untuk demo; di produksi gunakan hashing server (argon2/bcrypt).
- Validasi QR dilakukan terhadap data di perangkat yang sama; di produksi tanda tangan token harus diverifikasi server.

## Akun guru

Jadwal mengajar bisa ditambah/dihapus per hari (jadwal bentrok ditolak). Pengingat 10 menit sebelum jam mulai hanya muncul saat aplikasi terbuka di browser (`useScheduleReminder` di `src/lib/notifier.ts`).
