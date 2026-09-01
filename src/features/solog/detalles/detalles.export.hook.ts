import { useCallback, useRef, useState } from 'react'
import { getSologDetailsExport } from '../api'
import { useSolog } from '../context'
import { getSologErrorMessageFromUnknown } from '../errors'
import {
  downloadDetailsExport,
  validateDetailsExportResponse,
} from './detalles.export'

export function useSologDetailsExport() {
  const { updateServerNow } = useSolog()
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const running = useRef(false)

  const exportExcel = useCallback(async () => {
    if (running.current) return

    running.current = true
    setExporting(true)
    setError(null)
    setNotice(null)
    try {
      const rawResponse = await getSologDetailsExport()
      const response = validateDetailsExportResponse(rawResponse)
      updateServerNow(response.server_now)
      await downloadDetailsExport(response)
      setNotice(
        response.rows.length === 0
          ? 'Excel generado. El período no contiene diferencias finales.'
          : `Excel generado con ${response.rows.length} ${response.rows.length === 1 ? 'diferencia final' : 'diferencias finales'}.`,
      )
    } catch (exportError) {
      setError(getSologErrorMessageFromUnknown(exportError))
    } finally {
      running.current = false
      setExporting(false)
    }
  }, [updateServerNow])

  return {
    error,
    exportExcel,
    exporting,
    notice,
  }
}
