import type { InvisiblePlugin } from 'white-web-sdk'

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

// TODO: Remove this function for the one from `white-web-sdk`.
const isArray = (a: any): a is any[] => {
  return a.__proxy && Array.isArray(a.__proxy.displayerTarget())
}

// Arrays must be replaced, since the SDK does not support partially update an array.
export const mergeAttributes = (w: InvisiblePlugin<{}, {}>, a: {}, b: {}, p: string[] = []) => {
  if (typeof a !== typeof b || (typeof a !== 'object' && a !== b) || Array.isArray(b) || isArray(a)) {
    w.updateAttributes(p, b)
  } else for (let k of Object.keys(b)) {
    mergeAttributes(w, a[k], b[k], [...p, k])
  }
}

export const nextAppId = (exist: Set<string>, kind: string): string => {
  let id: string
  do {
    id = kind + '-' + Math.random().toString(36).slice(2)
  } while (exist.has(id))
  return id
}
