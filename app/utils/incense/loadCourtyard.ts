export interface CourtyardOptions {
  signal: AbortSignal
  reducedMotion: boolean
  onReady: () => void
  onError: () => void
  onComplete: () => void
  onPhase: (text: string, subtitle: string, progress: number) => void
}
export interface CourtyardHandle {
  start: () => void
  skip: () => void
  setReducedMotion: (value: boolean) => void
  resetView: () => void
  confirm: () => void
  rollback: () => void
  dispose: () => void
}
export async function loadCourtyard() {
  return await import('./courtyardRenderer.js') as { createCourtyard: (host: HTMLElement, options: CourtyardOptions) => CourtyardHandle }
}
