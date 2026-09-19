type AdminDialogScrollTarget = {
  style: {
    overflow: string
  }
}

export function createAdminDialogScrollLock() {
  let activeLocks = 0
  let previousOverflow = ''

  return {
    lock(target: AdminDialogScrollTarget) {
      if (activeLocks === 0) {
        previousOverflow = target.style.overflow
        target.style.overflow = 'hidden'
      }
      activeLocks += 1

      let released = false
      return () => {
        if (released) return
        released = true
        activeLocks = Math.max(0, activeLocks - 1)
        if (activeLocks !== 0) return

        target.style.overflow = previousOverflow
        previousOverflow = ''
      }
    },
    count() {
      return activeLocks
    },
  }
}

export const adminDialogScrollLock = createAdminDialogScrollLock()
