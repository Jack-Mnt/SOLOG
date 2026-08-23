import { useCallback, useRef, useState } from 'react'
import {
  getCatalogPublicationPreview,
  publishCatalog,
} from '../../api'
import {
  getSologErrorMessage,
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../../errors'
import type { SologErrorCode } from '../../errors'
import type {
  CatalogPublicationPreview,
  PublishCatalogResponse,
  SologCatalogConflict,
} from '../../types'

export type CatalogPublicationStatus =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'invalid'
  | 'publishing'
  | 'error'

interface UseCatalogPublicationOptions {
  onPublished: (response: Extract<PublishCatalogResponse, { ok: true }>) => void
  onRejected: () => void
}

function getResponseError(code: string): string {
  return getSologErrorMessage(code as SologErrorCode)
}

export function useCatalogPublication({
  onPublished,
  onRejected,
}: UseCatalogPublicationOptions) {
  const [status, setStatus] = useState<CatalogPublicationStatus>('idle')
  const [preview, setPreview] = useState<Extract<CatalogPublicationPreview, { ok: true }> | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [conflicts, setConflicts] = useState<SologCatalogConflict[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null)
  const requestInProgress = useRef(false)
  const previewRequest = useRef<Promise<CatalogPublicationPreview> | null>(null)

  const requestPreview = useCallback(() => {
    if (!previewRequest.current) {
      previewRequest.current = getCatalogPublicationPreview().finally(() => {
        previewRequest.current = null
      })
    }
    return previewRequest.current
  }, [])

  const resetDialog = useCallback(() => {
    if (requestInProgress.current) return
    setStatus('idle')
    setPreview(null)
    setValidationErrors([])
    setConflicts([])
    setError(null)
  }, [])

  const prepare = useCallback(async () => {
    if (requestInProgress.current) return false
    requestInProgress.current = true
    setStatus('preparing')
    setPreview(null)
    setValidationErrors([])
    setConflicts([])
    setError(null)
    setNotice(null)
    try {
      const response = await requestPreview()
      if (!response.ok) {
        if (response.codigo === 'NO_APPROVED_CATALOG_CHANGES') {
          setStatus('idle')
          setNotice('No hay cambios aprobados pendientes de incorporar.')
          return false
        }
        setValidationErrors(response.errores ?? [])
        setConflicts(response.conflictos ?? [])
        setError(getResponseError(response.codigo))
        setStatus('invalid')
        return false
      }
      setPreview(response)
      setStatus('ready')
      return true
    } catch (previewError) {
      if (isSologApiErrorCode(previewError, 'NO_APPROVED_CATALOG_CHANGES')) {
        setStatus('idle')
        setNotice('No hay cambios aprobados pendientes de incorporar.')
        return false
      }
      setError(getSologErrorMessageFromUnknown(previewError))
      setStatus('error')
      return false
    } finally {
      requestInProgress.current = false
    }
  }, [requestPreview])

  const publish = useCallback(async () => {
    if (requestInProgress.current || !preview) return false
    requestInProgress.current = true
    setStatus('publishing')
    setError(null)
    try {
      const response = await publishCatalog()
      if (!response.ok) {
        setPreview(null)
        setError(getResponseError(response.codigo))
        setStatus('error')
        onRejected()
        return false
      }
      setPublishedVersion(response.version)
      setNotice(`Catálogo V${response.version} publicado correctamente.`)
      setPreview(null)
      setStatus('idle')
      onPublished(response)
      return true
    } catch (publishError) {
      setPreview(null)
      setError(
        isSologApiErrorCode(publishError, 'INVALID_CATALOG_PREVIEW')
          ? 'El catálogo cambió mientras se preparaba esta publicación. Actualiza la información y vuelve a intentarlo.'
          : getSologErrorMessageFromUnknown(publishError),
      )
      setStatus('error')
      onRejected()
      return false
    } finally {
      requestInProgress.current = false
    }
  }, [onPublished, onRejected, preview])

  return {
    status,
    preview,
    validationErrors,
    conflicts,
    error,
    notice,
    publishedVersion,
    prepare,
    publish,
    resetDialog,
    dismissNotice: () => setNotice(null),
  }
}
