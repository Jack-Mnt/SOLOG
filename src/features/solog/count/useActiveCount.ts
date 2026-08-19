import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  finishCount,
  getSologGroups,
  recountSologGroup,
  saveGroupCount,
} from '../api'
import { getOrCreateDeviceToken } from '../device'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
  SologApiError,
} from '../errors'
import type {
  SologActiveSession,
  SologCountFinishResponse,
  SologCountSaveResponse,
  SologGroupView,
  SologGroupsResponse,
  SologRecountResponse,
} from '../types'
import { isSologRecountGroup } from '../types'

type LoadStatus = 'loading' | 'ready' | 'error'

interface ActiveCountOptions {
  session: SologActiveSession
  view: SologGroupView
  mutation: 'save' | 'recount'
  refreshBootstrap: (preserveView?: boolean) => Promise<void>
  setNotice: (notice: string | null) => void
}

function secondsUntil(timestamp: string): number {
  const milliseconds = new Date(timestamp).getTime() - Date.now()
  if (!Number.isFinite(milliseconds)) return 0
  return Math.max(0, Math.ceil(milliseconds / 1000))
}

function useRemainingSeconds(expiraAt: string): number {
  const [remaining, setRemaining] = useState(() => secondsUntil(expiraAt))

  useEffect(() => {
    const update = () => setRemaining(secondsUntil(expiraAt))
    const timer = window.setInterval(update, 1000)
    queueMicrotask(update)

    return () => window.clearInterval(timer)
  }, [expiraAt])

  return remaining
}

export function useActiveCount({
  session,
  view,
  mutation,
  refreshBootstrap,
  setNotice,
}: ActiveCountOptions) {
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [response, setResponse] = useState<SologGroupsResponse | null>(null)
  const [saveResults, setSaveResults] = useState<
    Record<string, SologCountSaveResponse>
  >({})
  const [recountResults, setRecountResults] = useState<
    Record<string, SologRecountResponse>
  >({})
  const [savingGroupIds, setSavingGroupIds] = useState<string[]>([])
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadVersion = useRef(0)
  const expirationHandled = useRef(false)
  const savingGroupIdsRef = useRef(new Set<string>())
  const finishInFlight = useRef(false)
  const remainingSeconds = useRemainingSeconds(session.expira_at)

  const loadGroups = useCallback(async () => {
    const currentLoad = ++loadVersion.current
    setStatus('loading')
    setError(null)

    try {
      const nextResponse = await getSologGroups({
        device_token: getOrCreateDeviceToken(),
        vista: view,
      })

      if (
        mutation === 'recount' &&
        nextResponse.grupos.some((group) => !isSologRecountGroup(group))
      ) {
        throw new SologApiError('SOLOG_INVALID_RECOUNT_GROUP')
      }

      if (currentLoad !== loadVersion.current) return
      setResponse(nextResponse)
      setSaveResults({})
      setRecountResults({})
      setStatus('ready')
    } catch (loadError) {
      if (currentLoad !== loadVersion.current) return
      setError(getSologErrorMessageFromUnknown(loadError))
      setStatus('error')

      if (
        isSologApiErrorCode(
          loadError,
          'SOLOG_DEVICE_NOT_AUTHORIZED',
          'SOLOG_COUNT_NOT_AVAILABLE',
          'SOLOG_COUNT_NOT_ACTIVE',
          'SOLOG_COUNT_EXPIRED',
          'SOLOG_REFERENCE_SNAPSHOT_NOT_AVAILABLE',
        )
      ) {
        await refreshBootstrap()
      }
    }
  }, [mutation, refreshBootstrap, view])

  useEffect(() => {
    let active = true

    queueMicrotask(() => {
      if (active) void loadGroups()
    })

    return () => {
      active = false
      loadVersion.current += 1
    }
  }, [loadGroups, session.id])

  useEffect(() => {
    if (remainingSeconds > 0 || expirationHandled.current) return
    expirationHandled.current = true

    queueMicrotask(() => {
      setError('La sesión de conteo venció. Verificando su estado…')
      void refreshBootstrap(true)
    })
  }, [refreshBootstrap, remainingSeconds])

  const saveGroup = useCallback(
    async (grupoId: string, stockFisico: number) => {
      const group = response?.grupos.find((item) => item.grupo_id === grupoId)

      if (
        mutation !== 'save' ||
        !response ||
        !group ||
        group.contado ||
        remainingSeconds === 0 ||
        savingGroupIdsRef.current.has(grupoId)
      ) {
        return
      }

      savingGroupIdsRef.current.add(grupoId)
      setSavingGroupIds((current) => [...current, grupoId])
      setError(null)

      try {
        const result = await saveGroupCount({
          device_token: getOrCreateDeviceToken(),
          conteo_id: response.conteo_id,
          grupo_id: grupoId,
          stock_fisico: stockFisico,
        })

        setResponse((current) =>
          current
            ? {
                ...current,
                grupos: current.grupos.map((item) =>
                  item.grupo_id === grupoId
                    ? { ...item, contado: true }
                    : item,
                ),
              }
            : current,
        )
        setSaveResults((current) => ({ ...current, [grupoId]: result }))
      } catch (saveError) {
        setError(getSologErrorMessageFromUnknown(saveError))

        if (
          isSologApiErrorCode(
            saveError,
            'SOLOG_GROUP_ALREADY_COUNTED',
            'SOLOG_GROUP_NOT_ALLOWED_IN_COUNT',
          )
        ) {
          await loadGroups()
        } else if (
          isSologApiErrorCode(
            saveError,
            'SOLOG_DEVICE_NOT_AUTHORIZED',
            'SOLOG_COUNT_NOT_AVAILABLE',
            'SOLOG_COUNT_NOT_ACTIVE',
            'SOLOG_COUNT_EXPIRED',
            'SOLOG_REFERENCE_SNAPSHOT_NOT_AVAILABLE',
          )
        ) {
          await refreshBootstrap()
        }
      } finally {
        savingGroupIdsRef.current.delete(grupoId)
        setSavingGroupIds((current) =>
          current.filter((item) => item !== grupoId),
        )
      }
    },
    [
      loadGroups,
      refreshBootstrap,
      remainingSeconds,
      response,
      mutation,
    ],
  )

  const recountGroup = useCallback(
    async (
      grupoId: string,
      conteoOrigenId: string,
      stockFisico: number,
    ) => {
      const group = response?.grupos.find((item) => item.grupo_id === grupoId)

      if (
        mutation !== 'recount' ||
        !response ||
        !group ||
        !isSologRecountGroup(group) ||
        group.conteo_origen_id !== conteoOrigenId ||
        group.contado ||
        remainingSeconds === 0 ||
        savingGroupIdsRef.current.has(grupoId)
      ) {
        return
      }

      savingGroupIdsRef.current.add(grupoId)
      setSavingGroupIds((current) => [...current, grupoId])
      setError(null)

      try {
        const result = await recountSologGroup({
          device_token: getOrCreateDeviceToken(),
          conteo_id: conteoOrigenId,
          grupo_id: grupoId,
          stock_fisico: stockFisico,
        })

        setResponse((current) =>
          current
            ? {
                ...current,
                grupos: current.grupos.map((item) =>
                  item.grupo_id === grupoId
                    ? { ...item, contado: true }
                    : item,
                ),
              }
            : current,
        )
        setRecountResults((current) => ({ ...current, [grupoId]: result }))
      } catch (recountError) {
        setError(getSologErrorMessageFromUnknown(recountError))

        if (
          isSologApiErrorCode(
            recountError,
            'SOLOG_RECOUNT_NOT_ELIGIBLE',
            'SOLOG_RECOUNT_ALREADY_DONE',
          )
        ) {
          await loadGroups()
        } else if (
          isSologApiErrorCode(
            recountError,
            'SOLOG_RECOUNT_NOT_AVAILABLE',
          )
        ) {
          await refreshBootstrap(true)
        } else if (
          isSologApiErrorCode(
            recountError,
            'SOLOG_DEVICE_NOT_AUTHORIZED',
            'SOLOG_COUNT_NOT_AVAILABLE',
            'SOLOG_COUNT_NOT_ACTIVE',
            'SOLOG_COUNT_EXPIRED',
            'SOLOG_REFERENCE_SNAPSHOT_NOT_AVAILABLE',
          )
        ) {
          await refreshBootstrap()
        }
      } finally {
        savingGroupIdsRef.current.delete(grupoId)
        setSavingGroupIds((current) =>
          current.filter((item) => item !== grupoId),
        )
      }
    },
    [
      loadGroups,
      mutation,
      refreshBootstrap,
      remainingSeconds,
      response,
    ],
  )

  const finish = useCallback(async (): Promise<
    SologCountFinishResponse | null
  > => {
    if (!response || finishInFlight.current) return null

    finishInFlight.current = true
    setFinishing(true)
    setError(null)

    try {
      const result = await finishCount({
        device_token: getOrCreateDeviceToken(),
        conteo_id: session.id,
      })

      setNotice(
        session.tipo === 'reconteo'
          ? result.estado === 'completado'
            ? 'Reconteo completado'
            : `Reconteo finalizado parcialmente${
                result.reconteos_pendientes === null
                  ? ''
                  : ` · ${result.reconteos_pendientes} pendientes`
              }`
          : result.estado === 'completado'
            ? 'Conteo completado'
            : 'Conteo finalizado parcialmente',
      )
      await refreshBootstrap()
      return result
    } catch (finishError) {
      setError(getSologErrorMessageFromUnknown(finishError))

      if (
        isSologApiErrorCode(
          finishError,
          'SOLOG_DEVICE_NOT_AUTHORIZED',
          'SOLOG_COUNT_NOT_AVAILABLE',
          'SOLOG_COUNT_NOT_ACTIVE',
          'SOLOG_COUNT_EXPIRED',
          'SOLOG_REFERENCE_SNAPSHOT_NOT_AVAILABLE',
        )
      ) {
        await refreshBootstrap()
      }

      return null
    } finally {
      finishInFlight.current = false
      setFinishing(false)
    }
  }, [refreshBootstrap, response, session.id, session.tipo, setNotice])

  const countedGroups = useMemo(
    () => response?.grupos.filter((group) => group.contado).length ?? 0,
    [response],
  )
  const pendingRecounts = useMemo(
    () => response?.grupos.filter((group) => !group.contado).length ?? 0,
    [response],
  )
  const recountedThisView = Object.keys(recountResults).length

  return {
    status,
    response,
    saveResults,
    recountResults,
    savingGroupIds,
    finishing,
    error,
    remainingSeconds,
    expired: remainingSeconds === 0,
    countedGroups,
    pendingRecounts,
    recountedThisView,
    totalGroups: response?.grupos.length ?? 0,
    loadGroups,
    saveGroup,
    recountGroup,
    finish,
  }
}
