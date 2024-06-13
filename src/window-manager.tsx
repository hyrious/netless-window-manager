import Emittery from 'emittery'
import { h } from '@wopjs/dom'
import { disposableMap, disposableStore } from "@wopjs/disposable"
import { combine, from, val, type ReadonlyVal } from "value-enhancer"
import { TeleBoxManager, type TeleBoxColorScheme, type TeleBoxState } from '@netless/telebox-insider'
import { AnimationMode, reaction, type Camera, type CameraState, type Displayer, type Event, type InvisiblePlugin, type MagixEventListenerOptions, type Player, type Rectangle, type Room, type SceneDefinition, type Size, type View } from "white-web-sdk"
import { isPlayer, isRoom, isRoomWritable, listenPlayer, listenRoom, listenView } from "./invisible-plugin"
import { compareVersion, createLogger, debounced, mergeAttributes, nextAppId, supportsAspectRatio, type Logger } from './utils'
import { kStorage } from './synced-store'
import { App, type AppMeta } from './app'

export interface WindowManagerOptions {
  /// The object returned by `joinRoom()` or `replayRoom()`.
  room: Displayer
  /// The object returned by `useInvisiblePlugin().initialize(room)`.
  plugin$: ReadonlyVal<InvisiblePlugin<{}, {}>>
  /// Local readonly flag, apps can read this flag and disable user operations.
  readonly?: boolean
  /// Width / height of the effective area, need to be the same in all clients. Default is `16 / 9`.
  aspectRatio?: number
  /// When the effective area's width is equal to `baseWidth`, the `cameraState.scale` is `1`.
  /// You need to make sure this value is the same in all clients. Default is `1280`.
  baseWidth?: number
  /// Custom theme, default is `"auto"`.
  prefersColorScheme?: TeleBoxColorScheme
  /// Show window frame (title bar and border and footer). Default is `true`.
  frame?: boolean
  /// Stop syncing the main whiteboard viewport. Default is `false`.
  freedom?: boolean
}

export interface PageState {
  context: string
  index: number
  length: number
}

export interface WindowManagerEventData {
  boxStateChange: TeleBoxState
  darkModeChange: boolean
  prefersColorSchemeChange: TeleBoxColorScheme
  cameraStateChange: CameraState
  pageStateChange: PageState
  appSetupError: unknown
}

export interface AddAppOptions {
  kind: string
  /// Load this app from a remote script URL.
  src?: string
  /// See `src`, the global variable name to extract the app definition.
  name?: string
  /// Window title, default is `"{kind}-{randomId}"`.
  title?: string
  /// Initial app state.
  state?: {}
}

export interface WindowManager {

  readonly version: string

  /// Options.
  readonly options: WindowManagerOptions

  /// Events.
  readonly events: Emittery<WindowManagerEventData>

  /// Same as `this.room || this.player`.
  readonly displayer: Displayer

  /// Only available when `options.room` is returned by `joinRoom()`.
  readonly room: Room | undefined

  /// Only available when `options.room` is returned by `replayRoom()`.
  readonly player: Player | undefined

  /// Roughly equal to the whiteboard server's `Date.now()`.
  readonly now: number

  /// If `true`, mutations like `moveCamera()` `addApp()` can be executed without error.
  /// Note that this only guarantees code run in sync. It is still possible for async codes to throw error.
  readonly canOperate: boolean

  /// Root element.
  readonly dom: HTMLDivElement

  /// Local readonly flag, apps can read this flag and disable user operations.
  /// This flag does not affect `canOperate`.
  readonly readonly: boolean

  /// Width / height of the effective area, need to be the same in all clients. Default is `16 / 9`.
  readonly aspectRatio: number

  /// When the effective area's width is equal to `baseWidth`, the `cameraState.scale` is `1`.
  /// You need to make sure this value is the same in all clients. Default is `1280`.
  readonly baseWidth: number

  /// Custom theme, default is `"auto"`.
  readonly prefersColorScheme: TeleBoxColorScheme

  /// Resolved dark mode from `prefersColorScheme`.
  readonly darkMode: boolean

  /// Show window frame (title bar and border and footer). Default is `true`.
  readonly frame: boolean

  /// If `true`, stop syncing the main whiteboard's camera.
  /// However, the `pageState` is still synced. Default is `false`.
  readonly freedom: boolean

  /// Including the camera (centerX, centerY, scale) and the container's size (width, height).
  /// This field is synced with all clients unless `freedom` is `true`.
  readonly cameraState: CameraState

  /// The main whiteboard's page (index, length). Default is `{ index: 0, length: 1 }`.
  /// This field is synced with all clients.
  readonly pageState: PageState

  /// All window's state is synced, that is to say either all windows are minimized, or maximized, or normal.
  readonly boxState: TeleBoxState

  /// Read synced states.
  readonly attributes: {}

  /// Write a log to the whiteboard server.
  log(...args: any[]): void

  /// Release all listeners and remove all DOM elements.
  /// You can not access the room and apps after calling this method.
  dispose(): void

  /// Get the underlying invisible plugin instance.
  /// If the room is not writable, or plugin is not ready, returns `undefined`.
  writer(): InvisiblePlugin<{}, {}> | undefined

  /// Update the root state. It can silently fail when room is not writable.
  /// To test if the user can operate, see `canOperate`.
  setAttributes(partial: {}): void

  /// Update nested state. It can silently fail when room is not writable.
  /// To test if the user can operate, see `canOperate`.
  updateAttributes(keys: string | string[], value: unknown): void

  /// Handy method to recursively call `updateAttributes()`.
  /// It can silently fail when room is not writable.
  mergeAttributes(partial: {}): void

  /// Handy method to add listener on `attributes`.
  reaction<T>(getter: () => T, callback: (value: T, prev?: T) => void, options?: { key?: string; fireImmediately?: boolean }): () => void

  /// Update `readonly`.
  setReadonly(readonly: boolean): void

  /// Update `aspectRatio`, you need to make sure all clients share the same aspect ratio.
  setAspectRatio(ratio: number): void

  /// Update `baseWidth`, you need to make sure all clients share the same base width.
  setBaseWidth(width: number): void

  /// Update `prefersColorScheme` and `darkMode`.
  setPrefersColorScheme(value: TeleBoxColorScheme): void

  /// Update `frame`.
  setFrame(frame: boolean): void

  /// Update `freedom`.
  setFreedom(freedom: boolean): void

  /// Move the viewport. Set `animationMode: "immediately"` to skip local animation.
  moveCamera(camera: Partial<Camera> & { readonly animationMode?: AnimationMode }): void

  /// Move the viewport to contain a rectangle. Set `animationMode: "immediately"` to skip local animation.
  moveCameraToContain(rectangle: Rectangle & { readonly animationMode?: AnimationMode }): void

  /// Add a new page. If `after` is `true`, add the page right after the current one.
  /// Otherwise add the page to the end of the pages array.
  ///
  /// For example, suppose you're viewing the `b` page in pages `[a, b, c]`.
  /// Your `pageState` will be `{ index: 1, length: 3 }`.
  ///
  /// Now call `addPage({ after: true })`, the pages will become `[a, b, newPage, c]`.
  /// Your `pageState` will become `{ index: 1, length: 4 }`.
  ///
  /// If `scene.name` conflicts with an existing page, it will overwrite that page.
  /// In that case, the `after` param has no effect.
  addPage(options: { readonly scene?: SceneDefinition, readonly after?: boolean }): void

  /// Jump to current page + 1, or no effect when you're at the end of pages or no write permission.
  nextPage(): void

  /// Jump to current page - 1, or no effect when you're at the start of pages or no write permission.
  prevPage(): void

  /// Jump to some page, or no effect when you're at this page or no write permission.
  jumpPage(index: number): void

  /// Remove current page or some page at index, or no effect when you have no write permission.
  removePage(index?: number): void

  /// Send a broadcast message, or no effect when you have no write permission.
  dispatchEvent(event: string, payload: unknown): void

  /// Listen to broadcast messages, you will also receive messages sent by yourself.
  /// Test `event.authorId === room.observerId` to know if the message is sent by self.
  /// By default local events are received immediately. To ensure it comes from the backend,
  /// pass `{ fireSelfEventAfterCommit: true }` as the third param.
  addEventListener(event: string, callback: (event: Event) => void, options?: MagixEventListenerOptions): () => void

  /// Send a random message to the server and resolves when it comes back.
  /// This can make sure all local mutations have been uploaded to the server
  /// and you can safely switch to reader mode or disconnect from the room without data loss.
  nextFrame(): Promise<void>

  /// Add a new windowed app to whiteboard. Returns the app's unique ID.
  addApp(options: AddAppOptions): string | undefined

}

class WindowManagerImpl implements WindowManager {
  readonly namespace = 'netless-window-manager'
  readonly version = __VERSION__
  readonly disposeMap = disposableMap()
  readonly dispose = disposableStore([this.disposeMap, this.options.plugin$])
  readonly events = new Emittery<WindowManagerEventData>()
  readonly log: Logger

  readonly dom: HTMLDivElement = <div class={this.c("playground")} />
  readonly sizerDOM: HTMLDivElement = <div class={this.c("sizer")} />
  readonly wrapperDOM: HTMLDivElement = <div class={this.c("wrapper")} />
  readonly mainViewDOM: HTMLDivElement = <div class={this.c("main-view")} />
  readonly telebox = new TeleBoxManager({ root: this.wrapperDOM, prefersColorScheme: 'auto', fence: false })

  readonly aspectRatio$ = this.dispose.add(val(16 / 9))
  readonly baseWidth$ = this.dispose.add(val(1280))
  readonly effectiveRect$: ReadonlyVal<Size>
  readonly frame$ = this.dispose.add(val(true))
  readonly freedom$ = this.dispose.add(val(false))

  readonly pageState$: ReadonlyVal<PageState>
  readonly mainView: View
  readonly apps = new Map<string, App>()

  constructor(readonly options: WindowManagerOptions) {
    const { room } = options
    if (compareVersion(room.version, '2.16.51') < 0) throw new Error('[WindowManager]: requires white-web-sdk >= 2.16.51')
    if (!room.useMobXState) throw new Error('[WindowManager]: requires `useMobXState: true` in `new WhiteWebSdk()` params')
    if (!room.useMultiViews) throw new Error('[WindowManager]: requires `useMultiViews: true` in `joinRoom()` params')

    this.log = createLogger(room)
    this.dispose.add(() => this.telebox.destroy())

    // dom > sizer > wrapper > {main-view > whiteboard}, telebox
    this.wrapperDOM.appendChild(this.mainViewDOM)
    this.sizerDOM.appendChild(this.wrapperDOM)
    this.dom.appendChild(this.sizerDOM)

    this.mainView = room.views.createView()
    this.mainView.divElement = this.mainViewDOM
    this.dispose.add(() => room.views.forEach(view => view.release()))

    if (options.readonly != null) this.setReadonly(options.readonly)
    if (options.aspectRatio != null) this.setAspectRatio(options.aspectRatio)
    if (options.baseWidth != null) this.setBaseWidth(options.baseWidth)
    if (options.prefersColorScheme != null) this.setPrefersColorScheme(options.prefersColorScheme)
    if (options.frame != null) this.setFrame(options.frame)
    if (options.freedom != null) this.setFreedom(options.freedom)

    this.dispose.add(this.frame$.subscribe(frame => {
      this.dom.classList.toggle(this.c('frameless'), !frame)
    }))

    this.dispose.make(() => {
      const observer = new ResizeObserver(entries => {
        const { width = 0, height = 0 } = entries[0].contentRect || {}
        this.telebox.setContainerRect({ x: 0, y: 0, width, height })
      })
      observer.observe(this.dom)
      return () => observer.disconnect()
    })

    this.effectiveRect$ = this.dispose.add(from(
      () => {
        let { width, height } = this.telebox._containerRect$.value, ratio = this.aspectRatio$.value
        if (!(width > 0 && height > 0)) return { width: 1280, height: 720 }
        width = Math.min(height * ratio, width)
        return { width, height: width / ratio }
      },
      notify => {
        const disposers = [
          this.telebox._containerRect$.subscribe(notify),
          this.aspectRatio$.subscribe(notify),
        ]
        return () => disposers.forEach(dispose => dispose())
      },
      { equal: (a, b) => a.width === b.width && a.height === b.height }
    ))

    this.dispose.add(this.telebox._containerRect$.subscribe(rect => {
      const { width, height } = rect, ratio = this.aspectRatio$.value
      this.sizerDOM.classList.toggle(this.c('sizer-horizontal'), height * ratio > width)
      this.events.emit('cameraStateChange', this.cameraState)
    }))

    this.pageState$ = this.dispose.add(from(
      () => {
        const { contextPath, index, scenes } = this.displayer.state.sceneState
        return { context: contextPath, index, length: scenes.length }
      },
      notify => {
        if (this.room) return listenRoom(this.room, 'onRoomStateChanged', s => { if (s.sceneState) notify() })
        if (this.player) return listenPlayer(this.player, 'onPlayerStateChanged', s => { if (s.sceneState) notify() })
      },
      { eager: true, equal: (a, b) => a.context === b.context && a.index === b.index && a.length === b.length }
    ))

    this.dispose.add(this.pageState$.subscribe((pageState) => {
      this.mainView.focusScenePath = this.displayer.state.sceneState.scenePath
      this.events.emit('pageStateChange', pageState)
    }))

    if (supportsAspectRatio()) {
      this.dispose.add(this.aspectRatio$.subscribe(ratio => {
        this.wrapperDOM.style.aspectRatio = '' + ratio
      }))
    } else {
      this.dispose.add(this.effectiveRect$.subscribe(rect => {
        this.wrapperDOM.style.width = rect.width.toFixed(2) + 'px'
        this.wrapperDOM.style.height = rect.height.toFixed(2) + 'px'
      }))
    }

    this.dispose.add(combine([this.effectiveRect$, this.baseWidth$]).subscribe(([size, base]) => {
      const { centerX = 0, centerY = 0, scale = 1 } = this.attributes['camera'] || {}
      this.mainView.moveCamera({ centerX, centerY, scale: scale * size.width / base, animationMode: AnimationMode.Immediately })
    }))

    this.dispose.add(listenView(room, this.mainView, 'onCameraUpdatedByDevice', this.syncCameraToRemote))

    this.dispose.add(listenView(room, this.mainView, 'onCameraUpdated', () => {
      this.events.emit('cameraStateChange', this.cameraState)
    }))

    this.dispose.add(this.reaction(() => this.attributes['camera'], (camera?: Camera & { id: number }) => {
      if (this.freedom) return
      const observerId = this.options.room.observerId
      camera ||= { centerX: 0, centerY: 0, scale: 1, id: ~observerId }
      if (observerId === camera.id || ~observerId === camera.id) {
        this.syncMainView()
      }
      if (observerId !== camera.id) {
        this.mainView.moveCamera({ ...camera, scale: camera.scale * this.localScaleFactor })
      }
    }))

    this.dispose.add(this.freedom$.reaction(freedom => {
      if (freedom) return
      const camera = this.attributes['camera'] || { centerX: 0, centerY: 0, scale: 1 }
      this.mainView.moveCamera({ ...camera, scale: camera.scale * this.localScaleFactor })
    }))

    this.dispose.add(this.telebox._state$.reaction(() => {
      this.events.emit('boxStateChange', this.boxState)
    }))

    this.dispose.add(this.telebox._darkMode$.reaction(() => {
      this.events.emit('darkModeChange', this.darkMode)
    }))

    this.dispose.add(this.telebox._prefersColorScheme$.reaction(() => {
      this.events.emit('prefersColorSchemeChange', this.prefersColorScheme)
    }))

    this.dispose.add(this.telebox._minimized$.reaction((minimized) => {
      if (!minimized) setTimeout(() => {
        const offset = 0.001 * (Math.random() > 0.5 ? 1 : -1)
        this.telebox.boxes.forEach(box => box.resize(box.intrinsicWidth + offset, box.intrinsicHeight + offset, true))
      })
    }))

    this.telebox.events.on("minimized", (minimized) => {
      this.mergeAttributes({ minimized })
      if (minimized) {
        this.telebox.blurAll()
      } else {
        this.telebox.focusTopBox()
      }
    })

    this.telebox.events.on("maximized", (maximized) => {
      this.mergeAttributes({ maximized })
    })

    this.telebox.events.on("removed", (boxes) => {
      const apps = {} as { [id: string]: undefined }
      boxes.forEach(box => { apps[box.id] = void 0 })
      this.mergeAttributes({ apps })
    })

    this.telebox.events.on("intrinsic_move", debounced((box) => {
      const position = { x: box.intrinsicX, y: box.intrinsicY }
      this.mergeAttributes({ apps: { [box.id]: { position } } })
    }, 50))

    this.telebox.events.on("intrinsic_resize", debounced((box) => {
      const position = { width: box.intrinsicWidth, height: box.intrinsicHeight }
      this.mergeAttributes({ apps: { [box.id]: { position } } })
    }, 200))

    this.telebox.events.on("z_index", (box) => {
      const position = { z: box.zIndex }
      this.mergeAttributes({ apps: { [box.id]: { position } } })
    })

    this.dispose.add(this.reaction(() => this.attributes['apps'], (apps?: { [id: string]: AppMeta }) => {
      // TODO: refresh apps
    }))
  }

  reaction<T>(getter: () => T, callback: (value: T, prev?: T) => void, options: { key?: string; fireImmediately?: boolean } = {}): () => void {
    const key = options.key || Math.random().toString(36).slice(2)
    return this.options.plugin$.subscribe(() => {
      this.disposeMap.set(key, reaction(getter, callback, options))
      options.fireImmediately = true
    })
  }

  syncCameraToRemote = this.dispose.add(debounced(() => {
    if (this.freedom) return
    const camera = this.mainView.camera
    const scale = camera.scale / this.localScaleFactor
    this.setAttributes({ camera: { ...camera, scale, id: this.options.room.observerId } })
  }, 100))

  syncMainView = this.dispose.add(debounced(() => {
    if (isRoomWritable(this.options.room)) this.options.room.syncMainView(this.mainView)
  }, 1000))

  get displayer(): Displayer {
    return this.options.room
  }

  get room(): Room | undefined {
    return isRoom(this.options.room) ? this.options.room : undefined
  }

  get player(): Player | undefined {
    return isPlayer(this.options.room) ? this.options.room : undefined
  }

  get now(): number {
    return this.room?.calibrationTimestamp || (this.player ?
      this.player.beginTimestamp + this.player.progressTime
    : Date.now())
  }

  get canOperate(): boolean {
    return !!this.writer()
  }

  writer(): InvisiblePlugin<{}, {}> | undefined {
    let plugin = this.options.plugin$.value
    // @ts-expect-error `plugin.setAttributes` can be `undefined` when it is the dummy object.
    if (plugin.setAttributes && isRoomWritable(plugin.displayer)) return plugin
  }

  get attributes(): {} {
    try {
      // Throws error when the plugin was destroyed.
      // It is ok to return `{}` here in that case.
      return this.options.plugin$.value.attributes
    } catch {
      return {}
    }
  }

  setAttributes(partial: {}) {
    this.writer()?.setAttributes(partial)
  }

  updateAttributes(keys: string | string[], value: unknown) {
    this.writer()?.updateAttributes(keys, value)
  }

  mergeAttributes(ref: {}) {
    let w = this.writer()
    if (w) {
      let a = w.attributes
      mergeAttributes(w, a, ref)
    }
    return this.attributes
  }

  get aspectRatio(): number {
    return this.aspectRatio$.value
  }

  setAspectRatio(ratio: number) {
    this.aspectRatio$.set(ratio)
  }

  get readonly(): boolean {
    return this.telebox.readonly
  }

  setReadonly(readonly: boolean) {
    this.telebox.setReadonly(readonly)
  }

  get prefersColorScheme(): TeleBoxColorScheme {
    return this.telebox.prefersColorScheme
  }

  setPrefersColorScheme(value: TeleBoxColorScheme) {
    this.telebox.setPrefersColorScheme(value)
  }

  get darkMode(): boolean {
    return this.telebox.darkMode
  }

  get baseWidth(): number {
    return this.baseWidth$.value
  }

  setBaseWidth(width: number) {
    this.baseWidth$.set(width)
  }

  get cameraState(): CameraState {
    const { width = 1280, height = 720 } = this.telebox._containerRect$.value
    const { centerX = 0, centerY = 0, scale = 1 } = this.mainView.camera
    return { centerX, centerY, scale: scale / this.localScaleFactor, width, height }
  }

  get boxState(): TeleBoxState {
    return this.telebox.state
  }

  // `state.scale * localScaleFactor` = `mainView.camera.scale`.
  get localScaleFactor(): number {
    return this.effectiveRect$.value.width / this.baseWidth$.value
  }

  get frame(): boolean {
    return this.frame$.value
  }

  setFrame(frame: boolean) {
    this.frame$.set(frame)
  }

  get freedom(): boolean {
    return this.freedom$.value
  }

  setFreedom(freedom: boolean) {
    this.freedom$.set(freedom)
  }

  moveCamera(camera: Partial<Camera> & { readonly animationMode?: AnimationMode }) {
    const { centerX, centerY, scale } = this.cameraState
    let id = ~this.options.room.observerId // ~x = -x - 1
    if (camera.animationMode === AnimationMode.Immediately || this.freedom) {
      id = this.options.room.observerId
      const scale = (camera.scale || this.cameraState.scale) * this.localScaleFactor
      this.mainView.moveCamera({ ...camera, scale })
    }
    if (!this.freedom) {
      this.setAttributes({ camera: { centerX, centerY, scale, ...camera, id, animationMode: void 0 } })
    }
  }

  moveCameraToContain(rectangle: Rectangle & { readonly animationMode?: AnimationMode }) {
    const { width, height } = this.cameraState
    const centerX = rectangle.originX + rectangle.width / 2
    const centerY = rectangle.originY + rectangle.height / 2
    const scale = Math.min(width / rectangle.width, height / rectangle.height)
    this.moveCamera({ centerX, centerY, scale, animationMode: rectangle.animationMode })
  }

  get pageState(): PageState {
    return this.pageState$.value
  }

  addPage(options: { readonly scene?: SceneDefinition; readonly after?: boolean } = {}) {
    if (this.room && isRoomWritable(this.room)) {
      const { contextPath, index } = this.room.state.sceneState
      this.room.putScenes(contextPath, [options.scene || {}], options.after ? index + 1 : void 0)
    }
  }

  removePage(index?: number) {
    if (this.room && isRoomWritable(this.room)) {
      const { contextPath, scenePath, scenes } = this.room.state.sceneState
      if (index == null || !scenes[index]) {
        this.room.removeScenes(scenePath)
      } else {
        const path = (contextPath === '/' ? '' : contextPath) + '/' + scenes[index].name
        this.room.removeScenes(path)
      }
    }
  }

  jumpPage(index: number) {
    if (this.room && isRoomWritable(this.room)) {
      this.room.setSceneIndex(index)
    }
  }

  prevPage() {
    if (this.room && isRoomWritable(this.room)) {
      const { index } = this.room.state.sceneState
      if (index > 0) this.room.setSceneIndex(index - 1)
    }
  }

  nextPage() {
    if (this.room && isRoomWritable(this.room)) {
      const { index, scenes } = this.room.state.sceneState
      if (index + 1 < scenes.length) this.room.setSceneIndex(index + 1)
    }
  }

  dispatchEvent(event: string, payload: unknown) {
    if (isRoomWritable(this.displayer)) {
      this.displayer.dispatchMagixEvent(event, payload)
    }
  }

  addEventListener(event: string, callback: (event: Event) => void, options?: MagixEventListenerOptions): () => void {
    this.displayer.addMagixEventListener(event, callback, options)
    return () => this.displayer.removeMagixEventListener(event, callback)
  }

  async nextFrame(): Promise<void> {
    if (isRoomWritable(this.displayer)) {
      const event = 'next-frame:' + this.displayer.uid + ',' + Math.random().toString(36).slice(2)
      return new Promise<void>((resolve) => {
        const dispose = this.addEventListener(event, () => { dispose(); resolve() }, { fireSelfEventAfterCommit: true })
        this.dispatchEvent(event, null)
      })
    }
  }

  addApp(options: AddAppOptions): string | undefined {
    if (this.canOperate) {
      const { kind, src, name, title, state } = options
      if (src) {
        this.mergeAttributes({ registry: {} })
        this.updateAttributes(['registry', kind], { src, name })
      }

      const id = nextAppId(new Set(Object.keys(this.attributes[kStorage])), kind)
      this.mergeAttributes({ [kStorage]: {} })
      this.updateAttributes([kStorage, id], state)

      this.apps.set(id, new App(this, kind, id, true, title || id, state))

      return id
    }
  }

  c(name: string) {
    return this.namespace + '-' + name
  }
}

export function createWindowManager(a: WindowManagerOptions | ReadonlyVal<InvisiblePlugin<{}, {}>>): WindowManager {
  return new WindowManagerImpl('plugin$' in a ? a : { room: a.value.displayer, plugin$: a })
}
