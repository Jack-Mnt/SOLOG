import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, RotateCcw, Save, X } from 'lucide-react'
import { AdminDialog } from '../admin.dialog'
import { AdminNotice, IconButton } from '../admin.primitives'
import {
  useMasterData,
  useMasterDataStore,
} from '../masterdata/admin.masterdata.context'
import { QueryState } from '../admin.v2.presentation'

function categoryErrorMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : ''
  if (code === 'SOLOG_MASTERDATA_REVISION_CONFLICT') {
    return 'Las categorías cambiaron. Se recargó la fuente autoritativa; revisa antes de volver a confirmar.'
  }
  if (code === 'SOLOG_LOCK_CONFLICT_RETRYABLE') {
    return 'Otro cambio está en curso. Puedes reintentar la misma operación.'
  }
  if (code.includes('NOOP')) return 'La operación no produjo cambios.'
  return error instanceof Error
    ? error.message
    : 'No se pudo actualizar Categorías.'
}

export function AdminCategoriesDialog({ onClose }: { onClose: () => void }) {
  const masterData = useMasterData()
  const store = useMasterDataStore()
  const [createName, setCreateName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [orderDraft, setOrderDraft] = useState<{
    revision: number
    ids: string[]
  } | null>(null)
  const [discardConfirm, setDiscardConfirm] = useState(false)
  const [error, setError] = useState('')

  const categoryRevision = masterData.snapshot?.revisions.categories ?? -1
  const authoritativeOrder =
    masterData.snapshot?.categories.map((category) => category.id) ?? []
  const hasCurrentOrderDraft = orderDraft?.revision === categoryRevision
  const order =
    orderDraft?.revision === categoryRevision
      ? orderDraft.ids
      : authoritativeOrder
  const intent = store.intent()

  const categories = useMemo(() => {
    if (!masterData.snapshot) return []
    const byId = new Map(
      masterData.snapshot.categories.map((category) => [category.id, category]),
    )
    return order
      .map((id) => byId.get(id))
      .filter(
        (category): category is NonNullable<typeof category> => !!category,
      )
  }, [masterData.snapshot, order])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (!createName.trim() || hasCurrentOrderDraft) return
    try {
      setError('')
      await store.mutation('category_create', { nombre: createName.trim() })
      setCreateName('')
    } catch (reason) {
      setError(categoryErrorMessage(reason))
    }
  }

  const rename = async (
    event: FormEvent,
    categoryId: string,
    currentName: string,
  ) => {
    event.preventDefault()
    const normalized = editName.trim()
    if (
      !editing ||
      editing !== categoryId ||
      !normalized ||
      normalized === currentName.trim() ||
      hasCurrentOrderDraft
    ) {
      return
    }

    try {
      setError('')
      await store.mutation('category_rename', {
        category_id: editing,
        nombre: normalized,
      })
      setEditing(null)
      setEditName('')
    } catch (reason) {
      setError(categoryErrorMessage(reason))
    }
  }

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrderDraft({ revision: categoryRevision, ids: next })
  }

  const saveOrder = async () => {
    try {
      setError('')
      await store.mutation('category_reorder', { category_ids: order })
      setOrderDraft(null)
    } catch (reason) {
      setError(categoryErrorMessage(reason))
    }
  }

  const retry = () => {
    const action = store.intent()?.action
    setError('')
    void store
      .retryMutation()
      .then(() => {
        if (action === 'category_create') setCreateName('')
        if (action === 'category_rename') {
          setEditing(null)
          setEditName('')
        }
        if (action === 'category_reorder') setOrderDraft(null)
      })
      .catch((reason) => setError(categoryErrorMessage(reason)))
  }

  const requestClose = () => {
    if (hasCurrentOrderDraft) {
      setDiscardConfirm(true)
      return
    }
    onClose()
  }

  const discardAndClose = () => {
    setOrderDraft(null)
    setDiscardConfirm(false)
    onClose()
  }

  return (
    <>
      <AdminDialog
        title="Administrar categorías"
        description="Crea, renombra y define el orden operativo de las categorías."
        onClose={requestClose}
        closeDisabled={!!intent?.pending}
        kind="management"
        size="wide"
        footer={
          <>
            <button
              type="button"
              className="button button--secondary"
              disabled={!!intent?.pending}
              onClick={requestClose}
            >
              Cerrar
            </button>
            <button
              type="button"
              className="button"
              disabled={
                !!intent ||
                !hasCurrentOrderDraft ||
                order.length !== masterData.snapshot?.categories.length
              }
              onClick={() => void saveOrder()}
            >
              <Save size={16} aria-hidden="true" />
              Guardar orden
            </button>
          </>
        }
      >
        {!masterData.snapshot || !masterData.derived ? (
          <QueryState
            error={masterData.error}
            retry={masterData.retry}
            variant="compact"
          />
        ) : (
          <>
            <form
              className="admin-categories__create"
              onSubmit={(event) => void create(event)}
            >
              <label>
                Nueva categoría
                <input
                  value={createName}
                  disabled={!!intent || hasCurrentOrderDraft}
                  onChange={(event) => setCreateName(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="button"
                disabled={
                  !!intent || hasCurrentOrderDraft || !createName.trim()
                }
              >
                <Plus size={16} aria-hidden="true" />
                Crear categoría
              </button>
            </form>

            {hasCurrentOrderDraft && (
              <AdminNotice tone="info">
                Guarda o descarta el nuevo orden antes de realizar otros
                cambios.
              </AdminNotice>
            )}

            <div
              className="admin-categories__list"
              role="list"
              aria-label="Orden de categorías"
            >
              {categories.map((category, index) => {
                const counts = masterData.derived!.categoryCounts.get(
                  category.id,
                ) ?? { groups: 0, products: 0 }
                const isEditing = editing === category.id
                const renameChanged =
                  editName.trim() !== category.nombre.trim()

                return (
                  <div
                    className={
                      isEditing
                        ? 'admin-categories__row admin-categories__row--editing'
                        : 'admin-categories__row'
                    }
                    role="listitem"
                    key={category.id}
                  >
                    {isEditing ? (
                      <form
                        className="admin-categories__rename-inline"
                        onSubmit={(event) =>
                          void rename(event, category.id, category.nombre)
                        }
                      >
                        <label>
                          <input
                            autoFocus
                            aria-label={`Nuevo nombre de ${category.nombre}`}
                            value={editName}
                            disabled={!!intent}
                            onChange={(event) => setEditName(event.target.value)}
                          />
                        </label>
                        <div className="admin-categories__inline-actions">
                          <button
                            type="submit"
                            className="button"
                            disabled={
                              !!intent ||
                              hasCurrentOrderDraft ||
                              !editName.trim() ||
                              !renameChanged
                            }
                          >
                            <Save size={16} aria-hidden="true" />
                            Guardar
                          </button>
                          <button
                            type="button"
                            className="button button--secondary"
                            disabled={!!intent}
                            onClick={() => {
                              setEditing(null)
                              setEditName('')
                            }}
                          >
                            <X size={16} aria-hidden="true" />
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <span className="admin-categories__identity">
                          <strong>{category.nombre}</strong>
                          <small>
                            {counts.groups} grupos · {counts.products} productos
                          </small>
                        </span>
                        <div className="admin-categories__row-actions">
                          <IconButton
                            aria-label={`Subir ${category.nombre}`}
                            title="Subir categoría"
                            disabled={
                              !!intent || editing !== null || index === 0
                            }
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp size={16} aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            aria-label={`Bajar ${category.nombre}`}
                            title="Bajar categoría"
                            disabled={
                              !!intent ||
                              editing !== null ||
                              index === categories.length - 1
                            }
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown size={16} aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            aria-label={`Renombrar ${category.nombre}`}
                            title="Renombrar categoría"
                            disabled={
                              !!intent ||
                              hasCurrentOrderDraft ||
                              editing !== null
                            }
                            onClick={() => {
                              setEditing(category.id)
                              setEditName(category.nombre)
                            }}
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </IconButton>
                        </div>
                      </>
                    )}

                  </div>
                )
              })}
            </div>

            {error && (
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
            )}
          </>
        )}
      </AdminDialog>

      {discardConfirm && (
        <AdminDialog
          title="Descartar cambios de orden"
          kind="confirmation"
          description="Hay cambios de orden sin guardar."
          onClose={() => setDiscardConfirm(false)}
          footer={
            <>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setDiscardConfirm(false)}
              >
                Continuar editando
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={discardAndClose}
              >
                Descartar y cerrar
              </button>
            </>
          }
        >
          <p className="admin-dialog-help">
            El orden volverá al último estado guardado.
          </p>
        </AdminDialog>
      )}
    </>
  )
}
