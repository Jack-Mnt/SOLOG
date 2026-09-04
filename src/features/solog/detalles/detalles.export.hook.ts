import { useCallback, useRef, useState } from 'react'
import { getSologErrorMessageFromUnknown } from '../errors'
import type { DetailsStore } from './detalles.store'
import type { DetailsExportPeriod } from './detalles.v2'

export function useSologDetailsExport(store: DetailsStore) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const running = useRef(false)
  const exportExcel = useCallback(async (period: DetailsExportPeriod) => {
    if (running.current) return
    const generation = store.generation
    const site = store.summary?.site.id
    const current = () => generation === store.generation && site !== undefined && store.summary?.site.id === site
    running.current = true; setExporting(true); setError(null); setNotice(null)
    try {
      const response = await store.export(period)
      if (!current()) return
      const { downloadDetailsExport } = await import('./detalles.export')
      if (!current()) return
      await downloadDetailsExport(response, new Date(response.generated_at), current)
      if (current()) setNotice(response.rows.length === 0 ? 'Excel generado. El período no contiene diferencias finales.' :
        `Excel generado con ${response.rows.length} diferencias finales.`)
    } catch (e) { if (current()) setError(getSologErrorMessageFromUnknown(e)) }
    finally { running.current = false; if (current()) setExporting(false) }
  }, [store])
  return { exporting, error, notice, exportExcel }
}
