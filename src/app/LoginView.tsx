import './LoginView.css'

interface LoginViewProps {
  onLogin: () => void
}

// Fejkat inloggningsformulär för mock-fasen — se PLAN-live-server-v3.md.
// Riktig auth (JWT) porteras i steg 3.
export function LoginView({ onLogin }: LoginViewProps) {
  return (
    <div class="login-screen">
      <div class="login-card">
        <div class="login-brand">Ungap Live</div>
        <p class="login-sub">Logga in för att fortsätta.</p>
        <label class="login-field">
          E-post
          <input type="email" value="anders.marten@kalmar.se" readOnly />
        </label>
        <label class="login-field">
          Lösenord
          <input type="password" value="••••••••" readOnly />
        </label>
        <button class="btn btn-primary login-submit" type="button" onClick={onLogin}>
          Logga in
        </button>
      </div>
    </div>
  )
}
