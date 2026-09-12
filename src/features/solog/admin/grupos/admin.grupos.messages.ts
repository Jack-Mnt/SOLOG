export function groupsErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'SOLOG_MASTERDATA_REVISION_CONFLICT') return 'La estructura cambió. Se recargaron los datos; revisa y vuelve a confirmar.'
  if (code === 'SOLOG_LOCK_CONFLICT_RETRYABLE') return 'Otro cambio está en curso. Puedes reintentar la misma operación.'
  if (code === 'SOLOG_CATALOG_STAGING_CONFLICT') return 'Existe una preparación activa de Catálogo sobre esta estructura. Resuélvela o retírala antes de continuar.'
  if (code === 'SOLOG_GROUP_PRICE_MISMATCH' || code === 'SOLOG_GROUP_NOT_COMPATIBLE') return 'Los SKU seleccionados no son compatibles con el precio del grupo destino.'
  if (code === 'SOLOG_GROUP_NAME_CONFLICT') return 'Ya existe una estructura activa con ese nombre. Ajusta la máscara y vuelve a intentar.'
  if (code === 'SOLOG_INVALID_GROUP_VALUATION') return 'La configuración de valorizado no es válida.'
  if (code === 'SOLOG_GROUP_VALUATION_NOOP') return 'El valorizado ya tiene esa configuración.'
  if (code.includes('NOOP')) return 'La operación no produjo cambios porque la estructura ya está en ese estado.'
  return error instanceof Error ? error.message : 'No se pudo guardar el cambio de Grupos.'
}
