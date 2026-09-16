export type AdminDialogToken = symbol

export function createAdminDialogStack() {
  let dialogs: AdminDialogToken[] = []
  let revision = 0
  const listeners = new Set<() => void>()

  const emit = () => {
    revision += 1
    listeners.forEach((listener) => listener())
  }

  return {
    register(token: AdminDialogToken) {
      dialogs = [...dialogs.filter((dialog) => dialog !== token), token]
      emit()
      return () => {
        const next = dialogs.filter((dialog) => dialog !== token)
        if (next.length === dialogs.length) return
        dialogs = next
        emit()
      }
    },
    isTop(token: AdminDialogToken) {
      return dialogs.at(-1) === token
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot() {
      return revision
    },
  }
}

export const adminDialogStack = createAdminDialogStack()
