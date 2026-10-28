import { useEffect, useState } from "react"
import QRCode from "qrcode"

export function QrCode({ value, className = "" }: { value: string; className?: string }) {
  const [src, setSrc] = useState("")
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { margin: 0, width: 420, errorCorrectionLevel: "M", color: { dark: "#173e51", light: "#ffffff" } }).then(
      (u) => alive && setSrc(u),
    )
    return () => {
      alive = false
    }
  }, [value])
  return (
    <div className={`qr-real ${className}`} role="img" aria-label="Kode QR absensi">
      {src && <img src={src} alt="" />}
    </div>
  )
}
