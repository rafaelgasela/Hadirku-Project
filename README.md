# Hadirku Project

Sistem Presensi & Manajemen Kehadiran Siswa/Guru (Hadirku).

## Struktur Project

Proyek ini terdiri dari dua bagian:
- **`hadirku-app/`**: Frontend web application (React, TypeScript, Vite, Tailwind CSS / Styling kustom).
- **`hadirku-server/`**: Backend REST API server (Node.js, Express, Database).

## Panduan Menjalankan

### Frontend (`hadirku-app`)
```bash
cd hadirku-app
npm install
npm run dev
```

### Backend (`hadirku-server`)
```bash
cd hadirku-server
npm install
# Salin .env.example menjadi .env lalu sesuaikan konfigurasinya
cp .env.example .env
npm start
```
