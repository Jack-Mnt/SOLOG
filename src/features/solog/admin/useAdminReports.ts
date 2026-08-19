import { useCallback, useEffect, useRef, useState } from 'react'
import { getSologAdminReport } from '../api'
import {
  getSologErrorMessageFromUnknown,
  isSologApiErrorCode,
} from '../errors'
import type {
  SologAdminCountState,
  SologAdminDifferenceState,
  SologAdminPosAdjustmentState,
  SologAdminReportPayload,
  SologAdminReportResponse,
  SologAdminReportType,
  SologDifferenceState,
} from '../types'

export const ADMIN_REPORT_PAGE_SIZE = 50

export interface AdminReportDraftFilters {
  sedeId: string
  dateFrom: string
  dateTo: string
  countState: '' | SologAdminCountState
  differenceState: '' | SologAdminDifferenceState
  historyState: '' | SologDifferenceState
  posAdjustmentState: '' | SologAdminPosAdjustmentState
  internalCode: string
}

type AdminReportStatus = 'idle' | 'loading' | 'ready' | 'error'

function getLocalDateInputValue(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createDefaultFilters(): AdminReportDraftFilters {
  const today = getLocalDateInputValue()
  return {
    sedeId: '',
    dateFrom: today,
    dateTo: today,
    countState: '',
    differenceState: '',
    historyState: '',
    posAdjustmentState: '',
    internalCode: '',
  }
}

function usesInternalCode(reportType: SologAdminReportType): boolean {
  return reportType === 'history' || reportType === 'pos_adjustments'
}

function getFilterValidationError(
  reportType: SologAdminReportType,
  filters: AdminReportDraftFilters,
): string | null {
  if (filters.dateFrom > filters.dateTo) {
    return 'La fecha Desde no puede ser posterior a la fecha Hasta.'
  }

  if (usesInternalCode(reportType) && filters.internalCode !== '') {
    if (!/^\d+$/.test(filters.internalCode)) {
      return 'El código interno debe ser un entero positivo.'
    }

    const internalCode = Number(filters.internalCode)
    if (!Number.isSafeInteger(internalCode) || internalCode <= 0) {
      return 'El código interno debe ser un entero positivo seguro.'
    }
  }

  return null
}

function createPayload(
  reportType: SologAdminReportType,
  filters: AdminReportDraftFilters,
  offset: number,
): SologAdminReportPayload {
  const common = {
    ...(filters.sedeId ? { sede_id: filters.sedeId } : {}),
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
  }

  if (reportType === 'summary') {
    return { report_type: 'summary', ...common }
  }

  if (reportType === 'counts') {
    return {
      report_type: 'counts',
      ...common,
      ...(filters.countState ? { estado: filters.countState } : {}),
      limit: ADMIN_REPORT_PAGE_SIZE,
      offset,
    }
  }

  if (reportType === 'differences') {
    return {
      report_type: 'differences',
      ...common,
      ...(filters.differenceState
        ? { estado: filters.differenceState }
        : {}),
      limit: ADMIN_REPORT_PAGE_SIZE,
      offset,
    }
  }

  const internalCode = filters.internalCode
    ? Number(filters.internalCode)
    : undefined

  if (reportType === 'history') {
    return {
      report_type: 'history',
      ...common,
      ...(filters.historyState ? { estado: filters.historyState } : {}),
      ...(internalCode ? { c_interno: internalCode } : {}),
      limit: ADMIN_REPORT_PAGE_SIZE,
      offset,
    }
  }

  return {
    report_type: 'pos_adjustments',
    ...common,
    ...(filters.posAdjustmentState
      ? { estado: filters.posAdjustmentState }
      : {}),
    ...(internalCode ? { c_interno: internalCode } : {}),
    limit: ADMIN_REPORT_PAGE_SIZE,
    offset,
  }
}

export function useAdminReports({
  enabled,
  refreshOperationalState,
}: {
  enabled: boolean
  refreshOperationalState: () => Promise<void>
}) {
  const [reportType, setReportType] =
    useState<SologAdminReportType>('summary')
  const [draftFilters, setDraftFilters] =
    useState<AdminReportDraftFilters>(createDefaultFilters)
  const [appliedFilters, setAppliedFilters] =
    useState<AdminReportDraftFilters>(createDefaultFilters)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState<AdminReportStatus>('idle')
  const [data, setData] = useState<SologAdminReportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)
  const hasStarted = useRef(false)

  const loadReport = useCallback(
    async (
      nextType: SologAdminReportType,
      nextFilters: AdminReportDraftFilters,
      nextOffset: number,
    ) => {
      const currentRequest = ++requestVersion.current
      setStatus('loading')
      setError(null)

      try {
        const response = await getSologAdminReport(
          createPayload(nextType, nextFilters, nextOffset),
        )
        if (currentRequest !== requestVersion.current) return
        setData(response)
        setAppliedFilters(nextFilters)
        setOffset(nextOffset)
        setStatus('ready')
      } catch (reportError) {
        if (currentRequest !== requestVersion.current) return
        setError(getSologErrorMessageFromUnknown(reportError))
        setStatus('error')

        if (isSologApiErrorCode(reportError, 'SOLOG_ADMIN_ROLE_REQUIRED')) {
          await refreshOperationalState()
        }
      }
    },
    [refreshOperationalState],
  )

  useEffect(() => {
    if (!enabled) {
      hasStarted.current = false
      requestVersion.current += 1
      return
    }

    if (hasStarted.current) return
    hasStarted.current = true
    const initialFilters = createDefaultFilters()
    let active = true

    queueMicrotask(() => {
      if (active) void loadReport('summary', initialFilters, 0)
    })

    return () => {
      active = false
      requestVersion.current += 1
    }
  }, [enabled, loadReport])

  const updateFilters = useCallback(
    (updates: Partial<AdminReportDraftFilters>) => {
      setDraftFilters((current) => ({ ...current, ...updates }))
      setOffset(0)
      setData(null)
      setError(null)
      setStatus('idle')
      requestVersion.current += 1
    },
    [],
  )

  const apply = useCallback(() => {
    const validationError = getFilterValidationError(reportType, draftFilters)
    if (validationError) {
      setError(validationError)
      setStatus('error')
      return
    }

    void loadReport(reportType, draftFilters, 0)
  }, [draftFilters, loadReport, reportType])

  const reset = useCallback(() => {
    const defaultFilters = createDefaultFilters()
    setDraftFilters(defaultFilters)
    void loadReport(reportType, defaultFilters, 0)
  }, [loadReport, reportType])

  const selectReport = useCallback(
    (nextType: SologAdminReportType) => {
      if (nextType === reportType) return
      setReportType(nextType)
      setOffset(0)

      const validationError = getFilterValidationError(nextType, draftFilters)
      if (validationError) {
        setData(null)
        setError(validationError)
        setStatus('error')
        return
      }

      void loadReport(nextType, draftFilters, 0)
    },
    [draftFilters, loadReport, reportType],
  )

  const previousPage = useCallback(() => {
    const previousOffset = Math.max(0, offset - ADMIN_REPORT_PAGE_SIZE)
    void loadReport(reportType, appliedFilters, previousOffset)
  }, [appliedFilters, loadReport, offset, reportType])

  const nextPage = useCallback(() => {
    void loadReport(
      reportType,
      appliedFilters,
      offset + ADMIN_REPORT_PAGE_SIZE,
    )
  }, [appliedFilters, loadReport, offset, reportType])

  return {
    reportType,
    draftFilters,
    offset,
    status,
    data,
    error,
    updateFilters,
    apply,
    reset,
    selectReport,
    previousPage,
    nextPage,
  }
}
