import { CalendarCheck2 } from 'lucide-react'
import type { CajeroSessionController } from './cajero.session'
import { CajeroOperationalView } from './cajero.operativo'

export function CajeroDiario({ session }: { session: CajeroSessionController }) {
  return (
    <CajeroOperationalView
      categoryNavigation
      description="Registra los cambios rutinarios detectados en el Stock TumiSoft."
      emptyDetail="No hay grupos pendientes en este momento."
      emptyTitle="Conteo diario completado"
      icon={CalendarCheck2}
      session={session}
      title="Conteo diario"
      view="conteo_diario"
    />
  )
}