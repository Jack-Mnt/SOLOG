import { AdminCountsReport } from './AdminCountsReport'
import { AdminReportFilters } from './AdminReportFilters'
import { AdminPosAdjustmentsReport } from './AdminPosAdjustmentsReport'
import {
  ADMIN_REPORT_PAGE_SIZE,
  useAdminReports,
} from './useAdminReports'
import type { SologAdminReportType, SologAdminSite } from '../types'

const REPORT_LABELS: Record<SologAdminReportType, string> = {
  counts: 'Conteos',
  pos_adjustments: 'Ajuste POS',
}

export function AdminReports({
  sites,
  refreshOperationalState,
  reportType,
}: {
  sites: SologAdminSite[]
  refreshOperationalState: () => Promise<void>
  reportType: SologAdminReportType
}) {
  const reports = useAdminReports({
    enabled: true,
    refreshOperationalState,
    initialReportType: reportType,
  })
  const currentData =
    reports.data?.report_type === reports.reportType ? reports.data : null
  const currentRows = currentData?.rows.length ?? 0

  return (
    <section className="content-section admin-reports" aria-labelledby="reports-title">
      <div className="section-heading">
        <div>
          <h2 id="reports-title">{REPORT_LABELS[reportType]}</h2>
          <p>Consulta procesada por backend con filtros server-side.</p>
        </div>
      </div>

      <AdminReportFilters
        filters={reports.draftFilters}
        loading={reports.status === 'loading'}
        onApply={reports.apply}
        onReset={reports.reset}
        onUpdate={reports.updateFilters}
        reportType={reports.reportType}
        sites={sites}
      />

      {reports.error ? (
        <div className="notice notice--error admin-message" role="alert">
          <strong>No se pudo cargar el reporte</strong>
          <p>{reports.error}</p>
        </div>
      ) : null}

      {reports.status === 'idle' ? (
        <div className="notice">
          <strong>Filtros pendientes de aplicar</strong>
          <p>Pulsa Aplicar para consultar el reporte.</p>
        </div>
      ) : null}

      {reports.status === 'loading' ? (
        <div className="notice" role="status">
          <strong>Consultando reporte…</strong>
          <p>Los filtros se procesan en una única llamada administrativa.</p>
        </div>
      ) : null}

      {currentData?.report_type === 'counts' ? (
        <AdminCountsReport report={currentData} />
      ) : null}
      {currentData?.report_type === 'pos_adjustments' ? (
        <AdminPosAdjustmentsReport report={currentData} />
      ) : null}

      {currentData ? (
        <nav className="admin-report-pagination" aria-label="Paginación del reporte">
          <button
            className="button button--secondary"
            disabled={reports.offset === 0 || reports.status === 'loading'}
            onClick={reports.previousPage}
            type="button"
          >
            <ArrowLeft size={17} /> Anterior
          </button>
          <span>Página {Math.floor(reports.offset / ADMIN_REPORT_PAGE_SIZE) + 1}</span>
          <button
            className="button button--secondary"
            disabled={
              currentRows !== ADMIN_REPORT_PAGE_SIZE ||
              reports.status === 'loading'
            }
            onClick={reports.nextPage}
            type="button"
          >
            Siguiente <ArrowRight size={17} />
          </button>
        </nav>
      ) : null}
    </section>
  )
}
import {
  ArrowLeft,
  ArrowRight,
} from 'lucide-react'
