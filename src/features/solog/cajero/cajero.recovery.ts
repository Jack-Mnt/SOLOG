export type CajeroRecoverySyncResult = 'complete' | 'remaining' | 'superseded'
export type CajeroRecoveryOutcome = 'recovered' | 'discarded' | 'superseded'

export interface CajeroRecoveryResult {
  attempts: number
  outcome: CajeroRecoveryOutcome
  lastError: unknown | null
}

export async function recoverExpiredCajeroContext({
  synchronize,
  clearRemaining,
  closeContext,
  isSupersededError,
}: {
  synchronize: () => Promise<CajeroRecoverySyncResult>
  clearRemaining: () => void
  closeContext: () => Promise<void>
  isSupersededError: (error: unknown) => boolean
}): Promise<CajeroRecoveryResult> {
  let lastError: unknown | null = null

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let result: CajeroRecoverySyncResult = 'remaining'
    try {
      result = await synchronize()
    } catch (error) {
      lastError = error
      if (isSupersededError(error)) result = 'superseded'
    }

    if (result === 'complete') {
      await closeContext()
      return { attempts: attempt, outcome: 'recovered', lastError }
    }

    if (result === 'superseded') {
      clearRemaining()
      await closeContext()
      return { attempts: attempt, outcome: 'superseded', lastError }
    }
  }

  clearRemaining()
  await closeContext()
  return { attempts: 2, outcome: 'discarded', lastError }
}
