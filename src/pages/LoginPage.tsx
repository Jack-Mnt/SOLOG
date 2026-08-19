import { useState, type FormEvent } from 'react'
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
    <main className="shell">
      <section className="status-card login-card" aria-labelledby="login-title">
        <p className="eyebrow">Puerto Rico</p>
        <h1 id="login-title">SOLOG</h1>
        <p className="subtitle">Ingresa con tu usuario existente.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              autoComplete="email"
              inputMode="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label>
            Contraseña
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="button" disabled={submitting} type="submit">
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  )
}
