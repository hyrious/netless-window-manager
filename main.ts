/// <reference path="./client.d.ts" />

import * as SDK from 'white-web-sdk'
import { WhiteWebSdk } from 'white-web-sdk'
import { useInvisiblePlugin, createWindowManager } from './src'
import './src/style.css'

let p = useInvisiblePlugin('WindowManager')

let sdk = new WhiteWebSdk({
  appIdentifier: import.meta.env.VITE_APPID,
  useMobXState: true,
  region: 'cn-hz',
})

let room = await sdk.joinRoom({
  uid: Math.random().toString(16).slice(2),
  uuid: import.meta.env.VITE_ROOM_UUID,
  roomToken: import.meta.env.VITE_ROOM_TOKEN,
  invisiblePlugins: [p.class],
  useMultiViews: true,
  disableNewPencil: false,
})

let manager = createWindowManager({
  room,
  plugin$: p.initialize(room),
  prefersColorScheme: 'light',
})

Object.assign(globalThis, { SDK, sdk, room, manager })

document.querySelector('#whiteboard')?.appendChild(manager.dom)

function debug() {
  let el = document.querySelector('#debug')!
  manager.events.onAny(() => {
    el.textContent = JSON.stringify(manager.pageState, null, 2) + ' ' + JSON.stringify(manager.cameraState, null, 2)
  })
}

debug()
