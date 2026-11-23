const DEVICE_TOKEN_STORAGE_KEY = 'solog.device_token.v1'
const DEVICE_TOKEN_BYTES = 32
const DEVICE_TOKEN_PATTERN = /^[a-f0-9]{64}$/

function generateDeviceToken(): string {
  const bytes = new Uint8Array(DEVICE_TOKEN_BYTES)
  crypto.getRandomValues(bytes)

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

/** Lectura pura: nunca crea un token ni escribe en storage. */
export function getStoredDeviceToken(storage: Pick<Storage, 'getItem'> = localStorage): string | null {
  const storedToken = storage.getItem(DEVICE_TOKEN_STORAGE_KEY)
  return storedToken && DEVICE_TOKEN_PATTERN.test(storedToken) ? storedToken : null
}

export function getOrCreateDeviceToken(): string {
  const storedToken = getStoredDeviceToken()
  if (storedToken) return storedToken

  const deviceToken = generateDeviceToken()
  localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, deviceToken)
  return deviceToken
}
