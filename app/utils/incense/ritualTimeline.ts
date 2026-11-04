/** Elapsed-time animation; skipped frames never skip completion or replay side effects. */
export function createRitualTimeline(callbacks: { pose: (seconds: number) => void; complete: () => void }) {
  let running = false, disposed = false, reduced = false, start = 0
  function finish() {
    if (!running || disposed) return
    running = false
    callbacks.complete()
  }
  return {
    get running() { return running },
    start(now: number) {
      if (disposed || running) return
      start = now
      running = true
      if (reduced) finish()
    },
    step(now: number) {
      if (!running || disposed) return
      const elapsed = Math.max(0, (now - start) / 1000)
      callbacks.pose(Math.min(14, elapsed))
      if (elapsed >= 14) finish()
    },
    skip: finish,
    setReducedMotion(value: boolean) { reduced = value; if (value) finish() },
    dispose() { disposed = true; running = false },
  }
}
