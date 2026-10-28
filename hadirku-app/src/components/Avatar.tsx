import { initials } from "../lib/util"

export function Avatar({ name, src, className = "large-avatar" }: { name: string; src?: string; className?: string }) {
  return src ? (
    <img className={`${className} photo`} src={src} alt={`Foto ${name}`} />
  ) : (
    <div className={className}>{initials(name)}</div>
  )
}
