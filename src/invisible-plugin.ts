import { disposableStore } from '@wopjs/disposable'
import { derive, flatten, type ReadonlyVal } from 'value-enhancer'
import { reactiveMap } from 'value-enhancer/collections'
import { InvisiblePlugin, RoomPhase, isPlayer as isPlayer_, isRoom as isRoom_, type Displayer, type InvisiblePluginClass, type Player, type PlayerCallbacks, type Room, type RoomCallbacks, type View, type ViewCallbacks } from 'white-web-sdk'

export const isRoom = (room: Displayer): room is Room => isRoom_(room)

export const isPlayer = (room: Displayer): room is Player => isPlayer_(room)

export const isRoomWritable = (room: Displayer): room is Room =>
  isRoom(room) && room.isWritable && room.phase === RoomPhase.Connected

const isTokenWritable = (displayer: Displayer): displayer is Room => {
  const room = displayer as Room
  const token_prefix = 'NETLESSROOM_'
  if (room.roomToken?.startsWith(token_prefix)) try {
    const str = atob(room.roomToken.slice(token_prefix.length))
    const index = str.indexOf("&role=")
    const role = +str[index + "&role=".length] // 0: admin, 1: writer, 2: reader
    return role < 2
  } catch (error) {
    console.error(error)
  }
  return false
}

/// ```js
/// const dispose = listenRoom(room, 'event', callback)
/// onExit: dispose()
/// ```
export function listenRoom<K extends keyof RoomCallbacks>(room: Room, event: K, callback: RoomCallbacks[K]) {
  //   ^^^^^^^^ Note: Function declaration will prevent `keyof` from being expanded to union.
  //                  https://github.com/Microsoft/TypeScript/issues/27171
  //                  However, `const fn = () =>` yields less minified code.
  room.callbacks.on(event, callback)
  return () => room.callbacks.off(event, callback)
}

/// ```js
/// const dispose = listenPlayer(player, 'event', callback)
/// onExit: dispose()
/// ```
export function listenPlayer<K extends keyof PlayerCallbacks>(player: Player, event: K, callback: PlayerCallbacks[K]) {
  player.callbacks.on(event, callback)
  return () => player.callbacks.off(event, callback)
}

/// ```js
/// const dispose = listenView(room, view, 'event', callback)
/// onExit: dispose()
/// ```
export function listenView<K extends keyof ViewCallbacks>(room: Displayer, view: View, event: K, callback: ViewCallbacks[K]) {
  view.callbacks.on(event, callback)
  return () => view.callbacks.off(event, callback)
}

/// ```js
/// const a = useInvisiblePlugin("WindowManager")
/// await room.joinRoom({ invisiblePlugins: [a.class] })  // register plugin class
/// const plugin$ = a.initialize(room)                    // initialize plugin instance
/// console.log(JSON.stringify(plugin$.value.attributes)) // get syncted state
/// onExit: a.dispose()                                   // dispose everything
/// ```
export const useInvisiblePlugin = <Kind extends string>(kind: Kind) => {
  const map = reactiveMap<Displayer, InvisiblePlugin<{}, {}>>()
  const dispose = disposableStore([map])

  class Plugin extends InvisiblePlugin<{}, {}> {
    static readonly kind = kind
    static onCreate(plugin: InvisiblePlugin<{}, {}>) { map.set(plugin.displayer, plugin) }
    static onDestroy(plugin: InvisiblePlugin<{}, {}>) { map.delete(plugin.displayer) }
  }

  const getPlugin = (room: Displayer) => {
    {
      let plugin = room.getInvisiblePlugin(kind)
      if (plugin) map.set(room, plugin)
    }

    const plugin$ = dispose.add(flatten(map.$, map => map.get(room), { eager: true }))

    const createPlugin = () => {
      if (!map.has(room) && isRoomWritable(room))
        room.createInvisiblePlugin(Plugin, {}).catch(console.warn)
    }

    if (isTokenWritable(room)) {
      dispose.add(plugin$.reaction(createPlugin))
      dispose.add(listenRoom(room, 'onEnableWriteNowChanged', createPlugin))
    }

    if (isRoom(room)) dispose.add(listenRoom(room as Room, 'onPhaseChanged', phase => {
      if (phase === RoomPhase.Disconnected) dispose()
    }))

    createPlugin()

    const Empty = { displayer: room, attributes: {} } as Plugin

    return derive(plugin$, plugin => plugin || Empty)
  }

  return {
    class: Plugin as InvisiblePluginClass<Kind, {}, {}>,
    initialize: getPlugin as (room: Displayer) => ReadonlyVal<InvisiblePlugin<{}, {}>>,
    dispose: dispose as () => void,
  }
}
