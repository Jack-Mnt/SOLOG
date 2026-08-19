import type { AuthError } from '@supabase/supabase-js'

export function getAuthErrorMessage(error: unknown): string {
  const authError = error as AuthError | undefined

  if (authError?.code === 'invalid_credentials') {
    return 'Email o contraseña incorrectos.'
  }

  return 'No se pudo iniciar sesión. Verifica tus datos e inténtalo nuevamente.'
}
