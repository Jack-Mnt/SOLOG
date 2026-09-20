import { useState } from 'react'
import { Save } from 'lucide-react'
import { AdminDialog } from '../admin.dialog'
import { AdminBinarySwitch, AdminNotice } from '../admin.primitives'
import { Value } from '../admin.v2.presentation'
import { CatalogMutationNotice } from '../catalogo/admin.catalogo.feedback'
import { catalogMutationError } from '../catalogo/admin.catalogo.feedback.utils'
import { useCatalogStore } from '../catalogo/admin.catalogo.context'
import { useMasterData } from '../masterdata/admin.masterdata.context'
import type { MasterDataSetupRequired } from '../masterdata/admin.masterdata.v1'
import { QueryState } from '../admin.v2.presentation'

export type ProductSetupTarget = Pick<
  MasterDataSetupRequired,
  'propuesta_fingerprint' | 'c_interno' | 'producto' | 'precio' | 'tipo'
>

const destinationOptions = [
  { value: 'existing_group', label: 'Grupo existente' },
  { value: 'new_unit', label: 'Grupo unitario' },
] as const

export function ProductSetupDialog({
  target,
  onClose,
  onComplete,
}: {
  target: ProductSetupTarget
  onClose: () => void
  onComplete: () => void
}) {
  const store = useCatalogStore()
  const masterData = useMasterData()
  const [mode, setMode] = useState<'existing_group' | 'new_unit'>('existing_group')
  const [groupId, setGroupId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [brand, setBrand] = useState('')
  const [error, setError] = useState('')
  const intent = store.intent()
  const compatibleGroups =
    masterData.snapshot?.groups.filter((group) => group.precio === target.precio) ?? []

  const submit = () => {
    if (!masterData.snapshot) return
    setError('')
    const payload =
      mode === 'existing_group'
        ? {
            propuesta_fingerprint: target.propuesta_fingerprint,
            mode: 'existing_group' as const,
            grupo_id: groupId,
            marca: brand.trim() || null,
          }
        : {
            propuesta_fingerprint: target.propuesta_fingerprint,
            mode: 'new_unit' as const,
            categoria_id: categoryId,
            marca: brand.trim() || null,
          }

    void store
      .mutation('prepare_product', payload)
      .then(onComplete)
      .catch((reason: unknown) =>
        setError(
          catalogMutationError(store, reason, 'No se pudo guardar la configuración.'),
        ),
      )
  }

  const retry = () => {
    setError('')
    void store
      .retryMutation()
      .then(onComplete)
      .catch((reason: unknown) =>
        setError(
          catalogMutationError(store, reason, 'No se pudo confirmar la configuración.'),
        ),
      )
  }

  const valid =
    !!masterData.snapshot &&
    (mode === 'existing_group'
      ? compatibleGroups.some((group) => group.id === groupId)
      : !!categoryId)

  return <AdminDialog
    title="Configurar producto"
    description={
      target.tipo === 'reincorporar_producto'
        ? 'Completa la configuración necesaria para reincorporar este producto.'
        : 'Completa la configuración necesaria para incorporar este producto.'
    }
    onClose={onClose}
    closeDisabled={!!intent?.pending}
    footer={
      <>
        <button
          type="button"
          className="button button--secondary"
          disabled={!!intent?.pending}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="admin-product-setup-form"
          className="button"
          disabled={!!intent || !valid}
        >
          <Save size={16} aria-hidden="true" />
          Guardar configuración
        </button>
      </>
    }
  >
    <div className="admin-dialog-task">
      <dl className="admin-dialog-context">
        <div>
          <dt>Producto</dt>
          <dd>{target.producto}</dd>
        </div>
        <div>
          <dt>C. interno</dt>
          <dd>{target.c_interno}</dd>
        </div>
        <div>
          <dt>Precio</dt>
          <dd><Value value={target.precio} money /></dd>
        </div>
      </dl>

      <AdminNotice tone="info">
        La configuración quedará preparada y se aplicará al publicar el Catálogo.
      </AdminNotice>

      {!masterData.snapshot ? (
        <QueryState error={masterData.error} retry={masterData.retry} variant="compact" />
      ) : (
        <form
          id="admin-product-setup-form"
          className="admin-v2-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <AdminBinarySwitch
            label="Destino"
            value={mode}
            options={destinationOptions}
            onChange={setMode}
            disabled={!!intent?.pending}
          />

          {mode === 'existing_group' ? (
            <label>
              Grupo
              <select
                required
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
              >
                <option value="">
                  {compatibleGroups.length ? 'Seleccionar' : 'No hay grupos compatibles'}
                </option>
                {compatibleGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Categoría
              <select
                required
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Seleccionar</option>
                {masterData.snapshot.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Marca opcional
            <input value={brand} onChange={(event) => setBrand(event.target.value)} />
          </label>
        </form>
      )}

      {intent && <CatalogMutationNotice onRetry={retry} />}
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
    </div>
  </AdminDialog>
}
