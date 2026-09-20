import { useMemo, useState } from 'react'
import { MoveRight, RotateCcw, Unlink } from 'lucide-react'
import { AdminDialog } from '../admin.dialog'
import { AdminNotice, IconButton } from '../admin.primitives'
import type {
  MasterDataDerived,
  MasterDataProduct,
  MasterDataSnapshot,
} from '../masterdata/admin.masterdata.v1'
import { Value } from '../admin.v2.presentation'
import { useGroupsStore } from './admin.grupos.context'
import { groupCandidates, type DerivedGroupRow } from './admin.grupos.model'
import { groupsErrorMessage } from './admin.grupos.messages'

const CANDIDATE_LIMIT = 50

export function GroupCandidatePicker({
  snapshot,
  derived,
  selected,
  onChange,
  price,
  excludeGroupId,
}: {
  snapshot: MasterDataSnapshot
  derived: MasterDataDerived
  selected: MasterDataProduct[]
  onChange: (rows: MasterDataProduct[]) => void
  price?: number
  excludeGroupId?: string
}) {
  const [search, setSearch] = useState('')
  const selectedCodes = new Set(selected.map((product) => product.c_interno))
  const term = search.trim().toLocaleLowerCase('es-PE')

  const matchedCandidates = useMemo(() => {
    if (term.length < 2) return []
    return groupCandidates(snapshot, { price, excludeGroupId }).filter((product) => {
      const group = product.grupo_id
        ? derived.groupById.get(product.grupo_id)?.nombre ?? ''
        : ''
      return [
        product.c_interno,
        product.producto,
        product.marca,
        product.c_barras,
        group,
      ]
        .filter((value): value is string | number => value !== null)
        .join(' ')
        .toLocaleLowerCase('es-PE')
        .includes(term)
    })
  }, [derived, excludeGroupId, price, snapshot, term])

  const candidates = matchedCandidates.slice(0, CANDIDATE_LIMIT)
  const toggle = (product: MasterDataProduct) =>
    onChange(
      selectedCodes.has(product.c_interno)
        ? selected.filter((item) => item.c_interno !== product.c_interno)
        : [...selected, product],
    )

  return (
    <section
      className="admin-groups__candidates"
      aria-label="Seleccionar SKU compatibles"
    >
      <label className="admin-groups__candidate-search">
        Buscar SKU compatible
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Código, producto, marca o grupo"
        />
      </label>

      {!!selected.length && (
        <p className="admin-groups__candidate-summary">
          {`${selected.length} seleccionados`}
          {price !== undefined && (
            <>
              {' '}
              · <Value value={price} money />
            </>
          )}
        </p>
      )}

      {term.length < 2 ? (
        <p className="admin-dialog-help">
          Busca por código, producto, marca o grupo.
        </p>
      ) : (
        <>
          {!!candidates.length && (
            <div className="admin-v2-picker admin-groups__candidate-list">
              {candidates.map((product) => {
              const sourceType = product.grupo_id
                ? derived.derivedTypeByGroupId.get(product.grupo_id)
                : undefined
              const sourceGroup = product.grupo_id
                ? derived.groupById.get(product.grupo_id)?.nombre
                : undefined
              const sourceLabel =
                sourceType === 'Único'
                  ? 'Único'
                  : sourceGroup ?? 'Sin grupo'

              return (
                <label
                  className="admin-groups__candidate"
                  key={product.c_interno}
                >
                  <input
                    type="checkbox"
                    checked={selectedCodes.has(product.c_interno)}
                    onChange={() => toggle(product)}
                  />
                  <span className="admin-groups__candidate-copy">
                    <strong>{product.producto}</strong>
                    <small>
                      C. interno {product.c_interno} · {sourceLabel} ·{' '}
                      <Value value={product.precio} money />
                    </small>
                  </span>
                </label>
              )
              })}
            </div>
          )}

          {!matchedCandidates.length && (
            <p className="admin-dialog-help">
              No hay SKU incluidos compatibles para esta búsqueda.
            </p>
          )}

          {matchedCandidates.length > CANDIDATE_LIMIT && (
            <p className="admin-dialog-help">
              Mostrando 50 resultados. Refina la búsqueda.
            </p>
          )}
        </>
      )}
    </section>
  )
}

export function GroupMembersDialog({
  group,
  snapshot,
  derived,
  onClose,
}: {
  group: DerivedGroupRow
  snapshot: MasterDataSnapshot
  derived: MasterDataDerived
  onClose: () => void
}) {
  const store = useGroupsStore()
  const [selected, setSelected] = useState<MasterDataProduct[]>([])
  const [separating, setSeparating] = useState<MasterDataProduct | null>(null)
  const [error, setError] = useState('')
  const intent = store.intent()

  const move = async () => {
    if (!selected.length) {
      setError('Selecciona uno o más SKU para agregar al grupo.')
      return
    }
    try {
      setError('')
      await store.mutation('membership_move', {
        grupo_destino_id: group.id,
        member_codes: selected.map((product) => product.c_interno),
      })
      onClose()
    } catch (reason) {
      setError(groupsErrorMessage(reason))
    }
  }

  const separate = async () => {
    if (!separating) return
    try {
      setError('')
      await store.mutation('make_unique', {
        c_interno: separating.c_interno,
      })
      onClose()
    } catch (reason) {
      setError(groupsErrorMessage(reason))
    }
  }

  const retry = () => {
    setError('')
    void store
      .retryMutation()
      .then(onClose)
      .catch((reason) => setError(groupsErrorMessage(reason)))
  }

  const categoryChanges = selected.some(
    (product) => product.categoria_id !== group.categoria_id,
  )
  const movedFromOtherGroup = selected.some(
    (product) => product.grupo_id !== group.id,
  )

  const renderErrorNotice = () =>
    error ? (
      <AdminNotice
        tone="error"
        action={
          intent && !intent.pending ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={retry}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Reintentar misma operación
            </button>
          ) : undefined
        }
      >
        {error}
      </AdminNotice>
    ) : null

  return (
    <>
      <AdminDialog
        title={`Integrantes · ${group.nombre}`}
        description={`${group.categoryName} · ${group.memberCount} SKU · ${group.derivedType} · S/ ${group.precio.toFixed(2)}`}
        onClose={onClose}
        closeDisabled={!!intent?.pending}
        variant="wide"
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
              type="button"
              className="button"
              disabled={!!intent || !selected.length}
              onClick={() => void move()}
            >
              <MoveRight size={16} aria-hidden="true" />
              Agregar al grupo
            </button>
          </>
        }
      >
        <div className="admin-dialog-task">
          <section className="admin-groups-members__section">
            <h3>Integrantes actuales</h3>
            <div className="admin-auxiliary-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Precio</th>
                    <th scope="col">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {group.members.map((member) => (
                    <tr key={member.c_interno}>
                      <td>{member.c_interno}</td>
                      <th scope="row">{member.producto}</th>
                      <td>
                        <Value value={member.precio} money />
                      </td>
                      <td>
                        {group.derivedType === 'Agrupado' && (
                          <IconButton
                            aria-label={`Separar ${member.producto} y dejar como Único`}
                            title="Separar y dejar como Único"
                            disabled={!!intent}
                            onClick={() => {
                              setError('')
                              setSeparating(member)
                            }}
                          >
                            <Unlink size={16} aria-hidden="true" />
                          </IconButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-groups-members__section">
            <h3>Agregar productos</h3>
            <GroupCandidatePicker
              snapshot={snapshot}
              derived={derived}
              selected={selected}
              onChange={setSelected}
              price={group.precio}
              excludeGroupId={group.id}
            />

            {!!selected.length && (movedFromOtherGroup || categoryChanges) && (
              <AdminNotice tone="info">
                {movedFromOtherGroup &&
                  'Los SKU que pertenecen a otro grupo se moverán automáticamente.'}
                {movedFromOtherGroup && categoryChanges ? ' ' : ''}
                {categoryChanges &&
                  `La categoría operativa de los SKU seleccionados cambiará a ${group.categoryName}.`}
              </AdminNotice>
            )}
          </section>

          {!separating && renderErrorNotice()}
        </div>
      </AdminDialog>

      {separating && (
        <AdminDialog
          title="Separar producto"
          description="El producto dejará el grupo y quedará como Único."
          onClose={() => setSeparating(null)}
          closeDisabled={!!intent}
          footer={
            <>
              <button
                type="button"
                className="button button--secondary"
                disabled={!!intent}
                onClick={() => setSeparating(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button"
                disabled={!!intent}
                onClick={() => void separate()}
              >
                <Unlink size={16} aria-hidden="true" />
                Separar
              </button>
            </>
          }
        >
          <div className="admin-dialog-confirmation">
            <dl className="admin-dialog-context">
              <div>
                <dt>Producto</dt>
                <dd>{separating.producto}</dd>
              </div>
              <div>
                <dt>C. interno</dt>
                <dd>{separating.c_interno}</dd>
              </div>
              <div>
                <dt>Grupo nuevo</dt>
                <dd>{separating.producto}</dd>
              </div>
            </dl>

            <AdminNotice tone="info">
              El resto del grupo se actualizará automáticamente si su estructura
              cambia.
            </AdminNotice>

            {renderErrorNotice()}
          </div>
        </AdminDialog>
      )}
    </>
  )
}
