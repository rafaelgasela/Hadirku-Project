import { Brand } from "../components/Brand"

export function Splash() {
  return (
    <div className="splash-screen">
      <div className="auth-decoration decoration-one" />
      <div className="auth-decoration decoration-two" />
      <div className="splash-center">
        <Brand />
        <p>Selalu tepat waktu</p>
      </div>
    </div>
  )
}
