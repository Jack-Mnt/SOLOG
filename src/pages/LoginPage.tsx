import { ArrowLeft, ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { PageShell } from '../components/PageShell'
import { useAuth } from '../features/auth/AuthContext'
import { getAuthErrorMessage } from '../features/auth/errors'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await login(email.trim(), password)
    } catch (loginError) {
      setError(getAuthErrorMessage(loginError))
      setSubmitting(false)
    }
  }

  return (
    <PageShell
      description="Inventarios físicos precisos, ágiles y conectados."
      eyebrow="Puerto Rico"
      title="Bienvenido"
      variant="auth"
    >
      <div className="login-card">
        <div className="login-intro">
          <strong>Acceso seguro</strong>
          <p>Ingresa con tu usuario existente de SOLOG.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Correo electrónico
            <span className="input-with-icon">
              <Mail aria-hidden="true" size={19} />
              <input
                autoComplete="email"
                inputMode="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </span>
          </label>

          <label>
            Contraseña
            <span className="input-with-icon">
              <LockKeyhole aria-hidden="true" size={19} />
              <input
                autoComplete="current-password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </span>
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="button" disabled={submitting} type="submit">
            <span>{submitting ? 'Ingresando…' : 'Ingresar a SOLOG'}</span>
            <ArrowRight aria-hidden="true" size={20} />
          </button>
        </form>
      </div>
      <a className="login-home-link" href="/">
        <ArrowLeft aria-hidden="true" size={17} />
        Volver al inicio
      </a>
    </PageShell>
  )
}
