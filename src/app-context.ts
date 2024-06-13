import type { ReadonlyTeleBox } from "@netless/telebox-insider"
import type { Displayer, Event as WhiteEvent, Player, Room } from "white-web-sdk"
import type { App } from "./app"
import Emittery from "emittery"
import { disposableStore } from "@wopjs/disposable"
import { Storage, type Diff } from './synced-store'
import { optionsMap } from "./app-registry"

export interface MagixEventMessage<Events = {}, K extends keyof Events & string = keyof Events & string> {
  event: K
  payload: Events[K]
  /// Session ID of the client who dispatched the event. It will be `AdminObserverId` for system events.
  authorId: number
  scope: `${WhiteEvent['scope']}`
  phase: `${WhiteEvent['phase']}`
}

export interface NetlessAppContext<State = {}, Events = {}, Options = {}> {
  readonly room: Room | undefined
  readonly player: Player | undefined
  readonly displayer: Displayer

  readonly appId: string
  readonly isAddApp: boolean
  readonly now: number
  readonly box: ReadonlyTeleBox
  readonly options: Options

  readonly state: State
  setState(partial: Partial<State>): void
  on(event: "stateChanged", callback: (diff: Diff<State>) => void): () => void
  on(event: "close", callback: () => void): () => void

  dispatchEvent<K extends keyof Events & string>(event: K, payload: Events[K]): void
  addEventListener<K extends keyof Events & string>(event: K, callback: (message: MagixEventMessage<Events, K>) => void): () => void

  connectStorage<State extends Record<string, any>>(namespace?: string, defaultState?: State): Storage<State>
}

export interface AppEvents<State = {}> {
  stateChanged: Diff<State>
  close: undefined
}

export class AppContext<S = {}, E = {}, O = {}> implements NetlessAppContext<S, E, O> {
  readonly dispose = disposableStore()
  readonly storage = new Storage(this.manager.options.plugin$, this.appId, this.app.state)
  readonly events = new Emittery<AppEvents<S>>()
  readonly on = this.events.on.bind(this.events)

  constructor(readonly app: App) {}

  get manager() { return this.app.manager }
  get room() { return this.manager.room }
  get player() { return this.manager.player }
  get displayer() { return this.manager.displayer }
  get now() { return this.manager.now }

  get kind() { return this.app.kind }
  get appId() { return this.app.id }
  get isAddApp() { return this.app.isAddApp }
  get box() { return this.app.box }
  get options() { return (optionsMap.get(this.app.kind) || {}) as O }
  get state() { return this.storage.state as S }

  setState(partial: Partial<S>) {
    this.storage.setState(partial)
  }

  dispatchEvent<K extends keyof E & string>(event: K, payload: E[K]) {
    this.manager.dispatchEvent(this.appId + ':' + event, payload)
  }

  addEventListener<K extends keyof E & string>(event: K, callback: (message: MagixEventMessage<E, K>) => void): () => void {
    return this.manager.addEventListener(this.appId + ':' + event, callback as any)
  }

  connectStorage<State extends Record<string, any>>(namespace: string, defaultState?: State): Storage<State> {
    const storage = this.dispose.add(new Storage(this.manager.options.plugin$, this.appId + ':' + namespace, defaultState))
    storage.on('disconnected', () => this.dispose.remove(storage))
    return storage
  }
}
