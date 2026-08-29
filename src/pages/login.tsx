import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../features/auth/context";
import { getAuthErrorMessage } from "../features/auth/errors";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(email.trim(), password);
    } catch (loginError) {
      setError(getAuthErrorMessage(loginError));
      setSubmitting(false);
    }
  };

  return (
    <main className="solog-login-shell">
      <section className="solog-login-brand" aria-label="Identidad SOLOG">
        <a
          aria-label="SOLOG, volver al inicio"
          className="solog-login-brand__logo"
          href="/"
        >
          <img alt="SOLOG" src="/Logo_SOLOG_dark.png" />
        </a>

        <div className="solog-login-art" aria-hidden="true">
          <span className="solog-login-art__halo" />
          <span className="solog-login-art__ring solog-login-art__ring--outer" />
          <span className="solog-login-art__ring solog-login-art__ring--inner" />
          <span className="solog-login-art__dot solog-login-art__dot--blue" />
          <span className="solog-login-art__dot solog-login-art__dot--violet" />
          <span className="solog-login-art__dot solog-login-art__dot--green" />
          <img alt="" src="/isotipo.svg" />
        </div>

        <div className="solog-login-brand__copy">
          <h2>Más cerca de la realidad.</h2>
          <p>
            Control inteligente de inventario para la operación de Puerto Rico.
          </p>
        </div>
      </section>

      <section className="solog-login-access" aria-labelledby="login-title">
        <div className="solog-login-panel">
          <a
            aria-label="SOLOG, volver al inicio"
            className="solog-login-mobile-logo"
            href="/"
          >
            <img alt="SOLOG" src="/Logo_SOLOG_dark.png" />
          </a>

          <div className="solog-login-heading">
            <p>Acceso interno</p>
            <h1 id="login-title">Bienvenido a SOLOG</h1>
            <span>Ingresa con tu cuenta para continuar.</span>
          </div>

          <form className="solog-login-form" onSubmit={handleSubmit}>
            <label htmlFor="solog-login-email">Correo electrónico</label>
            <div className="solog-login-control">
              <Mail aria-hidden="true" size={19} />
              <input
                autoComplete="email"
                id="solog-login-email"
                inputMode="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </div>

            <label htmlFor="solog-login-password">Contraseña</label>
            <div className="solog-login-control solog-login-control--password">
              <LockKeyhole aria-hidden="true" size={19} />
              <input
                autoComplete="current-password"
                id="solog-login-password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                aria-pressed={showPassword}
                className="solog-login-password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" size={18} />
                ) : (
                  <Eye aria-hidden="true" size={18} />
                )}
              </button>
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            <button
              className="solog-login-submit"
              disabled={submitting}
              type="submit"
            >
              <span>{submitting ? "Ingresando…" : "Ingresar"}</span>
            </button>
          </form>

          <div className="solog-login-links">
            <div></div>
            <a className="solog-login-text-link" href="/">
              <ArrowLeft aria-hidden="true" size={16} />
              Volver al inicio
            </a>
          </div>

          <div className="solog-login-mobile-copy">
            <strong>Más cerca de la realidad.</strong>
            <span>
              Control inteligente de inventario para las operaciones de Puerto
              Rico.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
