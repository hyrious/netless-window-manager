import type { ReadonlyVal } from "value-enhancer"
import { disposableStore } from "@wopjs/disposable"
import { listenUpdated, reaction, toJS, unlistenUpdated, type AkkoObjectUpdatedListener, type InvisiblePlugin } from "white-web-sdk"
import { isRoomWritable } from "./invisible-plugin"

const isObject = <O>(obj?: O): obj is O => typeof obj === 'object' && obj !== null

const assertObject = (obj: any, method: string): void => {
  if (isObject(obj)) return
  throw new Error(`[WindowManager]: ${method}() expects an object, got ${typeof obj}`)
}

const hasOwn = Object.prototype.hasOwnProperty
const has = <O, K extends string>(obj: O, key: K): obj is O & Record<K, Required<O>[Extract<K, keyof O>]> => hasOwn.call(obj, key)

const plainObjectKeys = Object.keys as <T>(o: T) => Array<keyof T & string>

export type DiffOne<T> = { oldValue?: T, newValue: T }
export type Diff<S> = { [K in keyof S]?: DiffOne<S[K]> }

const kRefine = '__IsReFiNe'

type RefineValue<V = any> = { k: string, v: V, [kRefine]: 1 }
type MaybeRefineValue<V = any> = V | RefineValue<V>
type RefineState<S = {}> = { [K in keyof S]: MaybeRefineValue<S[K]> }
type ValueOf<T> = T extends RefineValue<infer V> ? V : T

function isRefineValue<V>(value: MaybeRefineValue<V>): value is RefineValue<V> {
  return isObject(value) && (value as RefineValue)[kRefine] === 1
}

function makeRefineValue<V>(value: V, key = Math.random().toString().slice(2)): RefineValue<V> {
  return { k: key, v: value, [kRefine]: 1 }
}

export class Refine<S = {}> {

  public state = {} as S

  private refMap = new Map<any, RefineValue<any>>()
  private refKeys = new Set<string>()

  constructor(state: RefineState<S>) {
    this.replaceState(state)
  }

  replaceState(state: RefineState<S>): Diff<S> | null {
    assertObject(state, 'replaceState')
    let diff = {} as Diff<S>, dirty = false
    let keys = new Set([...plainObjectKeys(this.state), ...plainObjectKeys(state)])
    for (let key of keys) {
      let diffOne = this.setValue(key, state[key])
      if (diffOne) {
        dirty = true
        diff[key] = diffOne
      }
    }
    return dirty ? diff : null
  }

  setValue<K extends keyof S & string>(key: K, maybeRefValue: MaybeRefineValue<S[K]> | undefined): DiffOne<S[K]> | null {
    if (isObject(maybeRefValue)) {
      let refValue = this.ensureRefValue(maybeRefValue)
      if (refValue.v !== this.state[key]) {
        let oldValue = this.deleteRefKey(key)
        this.state[key] = refValue.v
        return { oldValue, newValue: refValue.v }
      }
    } else if (maybeRefValue === void 0) {
      if (has(this.state, key)) {
        let oldValue = this.deleteRefKey(key)
        delete this.state[key]
        return { oldValue, newValue: undefined as unknown as S[K] }
      }
    } else {
      let value = maybeRefValue as S[K]
      if (value !== this.state[key]) {
        let oldValue = this.deleteRefKey(key)
        this.state[key] = value
        return { oldValue, newValue: value }
      }
    }
    return null
  }

  toRefState(): RefineState<S> {
    return plainObjectKeys(this.state).reduce((refState, key) => {
      refState[key] = this.toRefValue(this.state[key])
      return refState
    }, {} as RefineState<S>)
  }

  toRefValue<K extends keyof S & string>(maybeRefValue: MaybeRefineValue<S[K]>) {
    return isObject(maybeRefValue) ? this.ensureRefValue(maybeRefValue) : maybeRefValue
  }

  ensureRefValue<V>(value: MaybeRefineValue<V>): RefineValue<V> {
    if (isRefineValue(value)) {
      this.refMap.set(value.v, value)
      return value
    }
    let refValue = this.refMap.get(value)
    if (!refValue) {
      refValue = makeRefineValue(value, this.nextKey())
      this.refMap.set(value, refValue)
    }
    return refValue
  }

  nextKey() {
    let key: string
    do {
      key = Math.random().toString(36).slice(2)
    } while (this.refKeys.has(key))
    this.refKeys.add(key)
    return key
  }

  deleteRefKey<K extends keyof S & string>(key: K): S[K] {
    let value = this.state[key], refValue = this.refMap.get(value)
    if (refValue) this.refKeys.delete(refValue.k)
    return value
  }

}

export const kStorage = '_WM-StOrAgE_'
export const kMainStorage = '_WM-MaIn-StOrAgE_'

export interface StorageEvents<S = {}> {
  stateChanged: Diff<S>
  disconnected: void
}

export class Storage<S = {}> {
  readonly _subscribers = {
    stateChanged: new Set<(diff: Diff<S>) => void>(),
    disconnected: new Set<() => void>(),
  }
  readonly _refine: Refine<S>
  readonly dispose = disposableStore()

  constructor(
    readonly plugin$: ReadonlyVal<InvisiblePlugin<{}, {}> | null>,
    readonly namespace = kMainStorage,
    readonly defaultState = {} as S,
  ) {
    if (defaultState && !isObject(defaultState)) {
      throw new Error(`[WindowManager]: Default state for storage ${namespace} is not an object`)
    }

    const read = (): RefineState<S> | undefined => this.plugin$.value?.attributes[kStorage]?.[this.namespace]
    const notify = (diff: Diff<S> | null) => diff && this.emit('stateChanged', diff)

    this._refine = new Refine(toJS(read()) || defaultState)

    const listenNamespaceProps = (raw: RefineState<S>): () => void => {
      const handler: AkkoObjectUpdatedListener<any> = (actions) => {
        if (actions.length === 0) return
        let diff = {} as Diff<S>, dirty = false
        for (let i = 0; i < actions.length; i++)  {
          const action = actions[i], key = action.key as keyof S & string
          if (key === kStorage) continue;
          const value = toJS(action.value)
          let diffOne = this._refine.setValue(key, value)
          if (diffOne) {
            dirty = true
            diff[key] = diffOne
          }
        }
        dirty && notify(diff)
      }
      listenUpdated(raw, handler)
      return () => unlistenUpdated(raw, handler)
    }

    const listenNamespace = (): () => void => {
      let stopListenProps = (): void => void 0
      let stop = reaction(read, (raw) => {
        if (raw) {
          notify(this._refine.replaceState(toJS(raw)))
          stopListenProps()
          stopListenProps = listenNamespaceProps(raw)
        }
      }, { fireImmediately: true })
      return () => { stop(); stopListenProps() }
    }

    this.dispose.add(this.plugin$.subscribe(listenNamespace))

    this.dispose.add(() => {
      this.emit('disconnected')
      this._subscribers.stateChanged.clear()
      this._subscribers.disconnected.clear()
    })
  }

  on<K extends keyof StorageEvents<S>>(event: K, callback: (data: StorageEvents<S>[K]) => void): () => void
  on<K extends keyof StorageEvents<S>>(event: K, callback: () => void): () => void
  on<K extends keyof StorageEvents<S>>(event: K, callback: (data?: any) => void): () => void {
    this._subscribers[event].add(callback)
    return () => this._subscribers[event].delete(callback)
  }

  emit<K extends keyof StorageEvents<S>>(event: K, data: StorageEvents<S>[K]): void
  emit<K extends keyof StorageEvents<S>>(event: K): void
  emit<K extends keyof StorageEvents<S>>(event: K, data?: any) {
    for (const fn of this._subscribers[event]) {
      try { fn(data) } catch (error) { console.error(error) }
    }
  }

  get canOperate(): boolean {
    let plugin = this.plugin$.value
    if (plugin?.setAttributes && isRoomWritable(plugin.displayer)) return true
    return false
  }

  get state(): Readonly<S> {
    return this._refine.state
  }

  setState(partial: Partial<S>) {
    const plugin = this.plugin$.value!
    if (this.canOperate) for (let key of plainObjectKeys(partial)) {
      const value = partial[key]
      plugin.updateAttributes([kStorage, this.namespace, key], isObject(value) ? this._refine.ensureRefValue(value) : value)
    }
  }

  resetState() {
    if (this.canOperate) {
      const plugin = this.plugin$.value!
      plugin.updateAttributes([kStorage, this.namespace], this.defaultState)
    }
  }
}
