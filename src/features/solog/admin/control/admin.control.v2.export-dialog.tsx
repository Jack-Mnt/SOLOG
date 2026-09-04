import { useEffect, useRef, useState } from 'react'
import { AdminDialog } from '../admin.dialog'
import { useAdminStore } from '../admin.v2.context'
import type { Biweekly } from '../admin.v2'
export function AdminExportDialog({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const store = useAdminStore()
  const [site, setSite] = useState(siteId)
  const [period, setPeriod] = useState<Biweekly>('current_biweekly')
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const running = useRef(false), active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const download = async () => {
    if (running.current) return
    running.current = true; setBusy(true); setError(null)
    try {
      const response = await store.load('export', { site_id: site, period })
      const { downloadAdminWorkbook } = await import('./admin.control.v2.export')
      if (!active.current || !store.current() || !store.bootstrap) return
      await downloadAdminWorkbook(response, () => active.current && store.current() && !!store.bootstrap)
      if (active.current) onClose()
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'No se pudo descargar.') }
    finally { running.current = false; if (active.current) setBusy(false) }
  }
  return <AdminDialog title="DESCARGAR AJUSTE" description="Descarga toda la información del período quincenal seleccionado. Los resultados se consultan al descargar; no se reutiliza la tabla visible." onClose={onClose} closeDisabled={busy} footer={<button className="button" disabled={busy || !site} onClick={() => void download()}>{busy ? 'Preparando…' : 'Descargar Excel'}</button>}>
    <div className="admin-v2-filters"><label>Sede de exportación<select disabled={busy} value={site} onChange={e => setSite(e.target.value)}>{store.bootstrap?.allowed_sites.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label><label>Período de exportación<select disabled={busy} value={period} onChange={e => setPeriod(e.target.value as Biweekly)}><option value="current_biweekly">Período actual quincenal</option><option value="previous_biweekly">Período anterior quincenal</option></select></label></div>
    <p>{period === 'current_biweekly' ? 'Período actual quincenal' : 'Período anterior quincenal'} · fechas resueltas por backend en America/Lima.</p>{error && <p role="alert">{error}</p>}
  </AdminDialog>
}
