import type { TeleBox, TeleBoxManager, TeleBoxManagerCreateConfig } from "@netless/telebox-insider"
import type { WindowManager } from "./window-manager"
import { disposableStore } from "@wopjs/disposable"
import { flatten } from "value-enhancer"
import { registry } from "./app-registry"
import { AppContext } from "./app-context"

function createBox(manager: any, options?: TeleBoxManagerCreateConfig) {
  return (manager.telebox as TeleBoxManager).create(options) as TeleBox
}

function removeBox(manager: any, id: string) {
  (manager.telebox as TeleBoxManager).remove(id, true)
}

export interface AppMeta {
  title: string
  position: { x: number; y: number; width: number; height: number; z: number }
  createdAt: number
}

export class App {
  readonly dispose = disposableStore()
  readonly definition = this.dispose.add(flatten(registry.$, map => map.get(this.kind)))
  readonly box = createBox(this.manager, { id: this.id, title: this.title, visible: false })
  readonly context = this.dispose.add(new AppContext(this))
  readonly result: any

  constructor(
    readonly manager: WindowManager,
    readonly kind: string,
    readonly id: string,
    readonly isAddApp: boolean,
    readonly title = kind + '-' + Math.random().toString(36).slice(2),
    readonly state: {} = {},
  ) {
    // Run setup() once and only once.
    const stop = this.dispose.add(this.definition.subscribe(async (def) => {
      if (def) try {
        const app = await def();
        (this as { result: any }).result = app.setup(this.context)
        this.box.setVisible(true)
      } catch (error) {
        console.error(error)
        manager.events.emit('appSetupError', error)
      } finally {
        Promise.resolve().then(() => stop())
      }
    }))

    // For creators, store attributes.apps[id] to trigger other clients creating this app.
    if (isAddApp) {
      this.manager.mergeAttributes({ apps: {} })
      this.manager.updateAttributes(['apps', this.id], {
        title: this.title,
        position: {
          x: this.box.intrinsicX,
          y: this.box.intrinsicY,
          width: this.box.intrinsicWidth,
          height: this.box.intrinsicHeight,
          z: this.box.zIndex,
        },
        createdAt: this.manager.now,
      } satisfies AppMeta)
    }

    this.manager.reaction(() => this.manager.attributes['apps']?.[this.id], (meta?: AppMeta) => {
      if (meta) {
        const { x, y, width, height, z } = meta.position;
        this.box.transform(x, y, width, height, true);
        this.box.setZIndex(z, true)
      }
    })
  }

  close() {
    removeBox(this.manager, this.id)
    this.context.events.emit('close')
  }
}
