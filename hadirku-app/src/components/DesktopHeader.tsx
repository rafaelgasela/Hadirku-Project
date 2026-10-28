import { Brand } from "./Brand"
import { Icon } from "./Icon"
import { Avatar } from "./Avatar"
import { navigate } from "../lib/router"
import type { User, Role } from "../lib/types"

interface DesktopHeaderProps {
  user: User | null
  route: string
  unreadCount?: number
  onLogout: () => void
}

export function DesktopHeader({
  user,
  route,
  unreadCount = 0,
  onLogout,
}: DesktopHeaderProps) {
  const role = user?.role

  const navLinks = role === 'parent'
    ? [
        { path: '/ortu', label: 'Beranda', icon: 'home' as const },
        { path: '/ortu/riwayat', label: 'Riwayat Absensi', icon: 'history' as const },
        { path: '/ortu/izin', label: 'Pengajuan Izin', icon: 'file' as const },
        { path: '/ortu/notifikasi', label: 'Notifikasi', icon: 'bell' as const, badge: unreadCount > 0 },
        { path: '/ortu/akun', label: 'Pengaturan Akun', icon: 'user' as const },
      ]
    : role === 'teacher'
    ? [
        { path: '/guru', label: 'Sesi Absensi & QR', icon: 'home' as const },
        { path: '/guru/jadwal', label: 'Jadwal Mengajar', icon: 'history' as const },
        { path: '/guru/izin', label: 'Persetujuan Izin', icon: 'file' as const },
        { path: '/guru/siswa', label: 'Kelola Siswa', icon: 'user' as const },
      ]
    : role === 'student'
    ? [
        { path: '/siswa', label: 'Beranda & QR', icon: 'home' as const },
        { path: '/siswa/riwayat', label: 'Riwayat Kehadiran', icon: 'history' as const },
        { path: '/siswa/izin', label: 'Status Izin', icon: 'file' as const },
        { path: '/siswa/akun', label: 'Akun Siswa', icon: 'user' as const },
      ]
    : []

  const roleBadge = role === 'parent'
    ? '👨‍👩‍👧 Orang Tua'
    : role === 'teacher'
    ? '👨‍🏫 Guru Pengajar'
    : role === 'student'
    ? '🎓 Siswa'
    : 'Tamu'

  return (
    <header className="desktop-navbar">
      <div className="desktop-nav-inner">
        {/* Logo & Brand */}
        <div className="desktop-nav-brand" onClick={() => role && navigate(role === 'parent' ? '/ortu' : role === 'teacher' ? '/guru' : '/siswa')}>
          <Brand />
        </div>

        {/* Navigation Links for Authenticated Users */}
        {user && navLinks.length > 0 && (
          <nav className="desktop-nav-links">
            {navLinks.map((item) => {
              const active = route === item.path || (item.path !== '/ortu' && item.path !== '/guru' && item.path !== '/siswa' && route.startsWith(item.path))
              return (
                <button
                  key={item.path}
                  type="button"
                  className={`desktop-nav-btn ${active ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                >
                  <Icon name={item.icon} size={16} />
                  <span>{item.label}</span>
                  {item.badge && <span className="nav-badge-pill">{unreadCount}</span>}
                </button>
              )
            })}
          </nav>
        )}

        {/* Right Section: User Profile & Actions */}
        <div className="desktop-nav-right">
          {user ? (
            <div className="desktop-user-menu">
              <Avatar name={user.name} src={user.avatar || user.avatar_url} className="small-avatar" />
              <div className="desktop-user-info">
                <strong>{user.name}</strong>
                <span className="role-tag">{roleBadge}</span>
              </div>
              <button
                type="button"
                className="desktop-logout-btn"
                onClick={onLogout}
                title="Keluar dari akun"
              >
                <Icon name="logout" size={16} />
                <span>Keluar</span>
              </button>
            </div>
          ) : (
            <div className="desktop-guest-actions">
              <button type="button" className="desktop-login-link" onClick={() => navigate('/masuk')}>
                Masuk
              </button>
              <button type="button" className="desktop-register-link" onClick={() => navigate('/daftar')}>
                Daftar Akun
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
