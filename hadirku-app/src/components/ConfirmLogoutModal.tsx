import { Icon } from "./Icon"
import { GoogleLogo } from "./Social"

interface ConfirmLogoutModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmLogoutModal({ isOpen, onClose, onConfirm }: ConfirmLogoutModalProps) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#fee2e2", color: "#ef4444", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
          <Icon name="logout" size={22} />
        </div>
        <h3 style={{ margin: "0 0 8px 0" }}>Keluar dari Akun?</h3>
        <p style={{ margin: "0 0 18px 0" }}>
          Sesi aktif Anda akan diakhiri. Anda akan diarahkan untuk melakukan login ulang menggunakan akun Google Anda.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            type="button"
            className="relogin-google-btn"
            style={{ width: "100%", height: "42px", fontSize: "12.5px" }}
            onClick={onConfirm}
          >
            <GoogleLogo size={16} />
            <span>Keluar &amp; Login Ulang Google</span>
          </button>
          <button
            type="button"
            className="modal-btn-cancel"
            style={{ width: "100%", height: "38px" }}
            onClick={onClose}
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  )
}
