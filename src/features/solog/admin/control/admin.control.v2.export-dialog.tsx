import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { AdminDialog } from '../admin.dialog'
import { AdminBinarySwitch, AdminNotice } from '../admin.primitives'
import { useAdminStore } from '../admin.v2.context'
import { adminSiteLabel } from '../admin.site-ui'
import type { Biweekly } from '../admin.v2'

const periodOptions = [
  { value: 'previous_biweekly', label: 'Anterior' },
  { value: 'current_biweekly', label: 'Actual' },
] as const

export function AdminExportDialog({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const store = useAdminStore()
  const site = store.bootstrap?.allowed_sites.find(candidate => candidate.id === siteId)
  const siteName = site ? adminSiteLabel(site.nombre) : '—'
  const [period, setPeriod] = useState<Biweekly>('current_biweekly')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)
  const active = useRef(true)

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  const download = async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError(null)
    try {
      const response = await store.load('export', { site_id: siteId, period })
      const { downloadAdminWorkbook } = await import('./admin.control.v2.export')
      if (!active.current || !store.current() || !store.bootstrap) return
      await downloadAdminWorkbook(response, () => active.current && store.current() && !!store.bootstrap)
      if (active.current) onClose()
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : 'No se pudo descargar.')
    } finally {
      running.current = false
      if (active.current) setBusy(false)
    }
  }

  return <AdminDialog
    title="Descargar ajuste"
    description="Genera un archivo Excel con la información de la quincena seleccionada."
    onClose={onClose}
    closeDisabled={busy}
    kind="task"
    footer={
      <>
        <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="button" disabled={busy} onClick={() => void download()}>
          <Download size={16} aria-hidden="true" />
          {busy ? 'Preparando…' : 'Descargar Excel'}
        </button>
      </>
    }
  >
      <dl className="admin-dialog-context">
        <div>
          <dt>Sede</dt>
          <dd>{siteName}</dd>
        </div>
      </dl>
      <AdminBinarySwitch
        label="Quincena"
        value={period}
        options={periodOptions}
        onChange={setPeriod}
        disabled={busy}
      />
      <p className="admin-dialog-help">Las fechas se calculan con horario de Lima.</p>
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
  </AdminDialog>
}
