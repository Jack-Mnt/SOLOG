const SITE_ORDER = ['cutervo', 'huaca', 'divino', 'unidad', 'casuarinas']

export function adminSiteLabel(name: string) {
  return name.trim().toLowerCase() === 'casuarinas' ? 'Casua' : name
}

export function orderedAdminSites<T extends { nombre: string }>(sites: readonly T[]): T[] {
  const rank = (name: string) => {
    const index = SITE_ORDER.indexOf(name.trim().toLowerCase())
    return index < 0 ? SITE_ORDER.length : index
  }
  return [...sites].sort((a, b) => rank(a.nombre) - rank(b.nombre))
}

export function deviceAccessLabel(value: string | null, now = Date.now()) {
  if (!value) return 'Sin acceso registrado'
  const date = new Date(value)
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' })
  const time = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit', hour12: true }).format(date)
  const label = day.format(date) === day.format(now) ? 'Hoy' : new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric' }).format(date)
  return label + ', ' + time
}
