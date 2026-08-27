import { SearchCheck } from 'lucide-react'
import type { CajeroSessionController } from './cajero.session'
import { CajeroOperationalView } from './cajero.operativo'
import { sortFollowupGroups } from './cajero.utils'

export function CajeroRevisar({ session }: { session: CajeroSessionController }) {
  return (
    <CajeroOperationalView
      description="Atiende únicamente los casos que requieren una nueva observación."
      emptyDetail="SOLOG consulta únicamente los casos problemáticos vigentes."
      emptyTitle="No hay casos para revisar."
      icon={SearchCheck}
      session={session}
      title="Revisar"
      transformGroups={sortFollowupGroups}
      view="revisar"
    />
  )
}