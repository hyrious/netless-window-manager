import type { NetlessAppContext } from "./app-context"
import { reactiveMap } from "value-enhancer/collections"

export interface NetlessApp<State = {}, Events = {}, Options = {}> {
  readonly kind: string
  setup(context: NetlessAppContext<State, Events, Options>): any
}

export const isNetlessApp = (a: any): a is NetlessApp =>
  a && typeof a.kind === 'string' && typeof a.setup === 'function'

interface RemoteNetlessApp {
  readonly kind: string
  readonly src: string
  readonly name?: string
}

export const isRemoteNetlessApp = (a: any): a is RemoteNetlessApp =>
  a && typeof a.kind === 'string' && typeof a.src === 'string'

interface AsyncNetlessApp {
  readonly kind: string
  src(): NetlessApp | Promise<NetlessApp>
}

export const isAsyncNetlessApp = (a: any): a is AsyncNetlessApp =>
  a && typeof a.kind === 'string' && typeof a.src === 'function'

/// @internal
export const registry = reactiveMap<string, () => Promise<NetlessApp>>()

/// @internal
export const optionsMap = new Map<string, {}>()

export const register = (def: NetlessApp | AsyncNetlessApp | RemoteNetlessApp, options?: {}) => {
  if (options) {
    optionsMap.set(def.kind, options)
  }
  if (isNetlessApp(def)) {
    registry.set(def.kind, () => Promise.resolve(def))
  } else if (isAsyncNetlessApp(def)) {
    registry.set(def.kind, () => Promise.resolve().then(def.src))
  } else if (isRemoteNetlessApp(def)) {
    registry.set(def.kind, () => fromScript(def))
  } else {
    console.warn('[WindowManager]: not a valid netless app', def)
    throw new Error('[WindowManager]: not a valid netless app')
  }
}

const fromScript = async ({ kind, src, name }: RemoteNetlessApp): Promise<NetlessApp> => {
  name ||= 'NetlessApp' + kind
  if (src.endsWith('.mjs')) {
    return fromModule(await import(/* @vite-ignore */ src + '?' + Date.now()))
  }
  let response = await fetch(src, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'text/plain' },
  })
  let text = await response.text()
  if (response.ok) {
    return execute(src, text, name)
  }
  throw new Error(text)
}

const fromModule = (mod: any): NetlessApp => {
  if (mod.default && isNetlessApp(mod.default)) {
    return mod.default
  } else for (let k in mod) if (isNetlessApp(mod[k])) {
    return mod[k]
  }
  console.warn('[WindowManager]: not found valid netless app', mod)
  throw new Error('[WindowManager]: not found valid netless app')
}

const execute = (src: string, text: string, name: string): NetlessApp => {
  let app = Function(text + '\n;return ' + name)()
  if (app == null) app = globalThis[name]
  if (isNetlessApp(app)) return app
  console.warn('[WindowManager]: not return valid netless app', src)
  throw new Error('[WindowManager]: not return valid netless app')
}
