import { useCallback, useRef, useState } from 'react'
import { getSologControlExport } from '../../api'
import { getSologErrorMessageFromUnknown } from '../../errors'
import type { SologControlExportPayload } from '../../types'
import {
  downloadControlExport,
  validateControlExportResponse,
} from './admin.control.export'

type ExportStatus = 'idle' | 'exporting'

export function useSologControlExport() {
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const running = useRef(false)

  const exportExcel = useCallback(async (payload: SologControlExportPayload) => {
    if (running.current) return
    running.current = true
    setStatus('exporting')
    setError(null)
    setNotice(null)
    try {
      const rawResponse = await getSologControlExport(payload)
      const response = validateControlExportResponse(rawResponse)
      if (response.rows.length === 0) {
        setNotice('No hay ajustes elegibles para exportar en la sede y el período aplicados.')
        return
      }
      await downloadControlExport(response)
      setNotice(`Excel generado con ${response.registros} ajuste${response.registros === 1 ? '' : 's'}.`)
    } catch (exportError) {
      setError(getSologErrorMessageFromUnknown(exportError))
    } finally {
      running.current = false
      setStatus('idle')
    }
  }, [])

  return {
    exporting: status === 'exporting',
    error,
    notice,
    exportExcel,
    dismissError: () => setError(null),
    dismissNotice: () => setNotice(null),
  }
}
