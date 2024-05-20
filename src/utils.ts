export const debounced = <T extends (...args: any[]) => void>(fn: T, timeout: number): T => {
  let timer = 0, lastTime = 0

  function refresh() {
    timer = 0
    lastTime = Date.now()
    try { fn() } catch (err) { console.error(err) }
  }

  function update() {
    if (timer > 0) return
    timer = setTimeout(refresh, Math.max(0, lastTime + timeout - Date.now()));
  }

  update.dispose = function dispose() {
    clearTimeout(timer)
    timer = 0
  }

  return update as unknown as T
}

export const compareVersion = (a: string, b: string): number => {
  const left = a.split('.').map(e => Number.parseInt(e))
  const right = b.split('.').map(e => Number.parseInt(e))
  for (let i = 0; i < left.length; i++) {
    if (left[i] < right[i]) return -1
    if (left[i] > right[i]) return 1
  }
  return 0
}

export const supportsAspectRatio = () => typeof CSS !== 'undefined' && CSS.supports && CSS.supports('aspect-ratio: 1')

export interface Logger { (...args: any[]): void }

export const createLogger = (room: unknown): Logger => {
  if (room && (room as any).logger) {
    return (...args) => (room as any).logger.info(...args)
  } else {
    return (...args) => console.info(...args)
  }
}
