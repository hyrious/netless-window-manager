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
})

let manager = createWindowManager(p.initialize(room))

Object.assign(globalThis, { SDK, sdk, room, manager })

document.querySelector('#whiteboard')?.appendChild(manager.dom)

function debug() {
  let el = document.querySelector('#debug')!

  setInterval(() => {
    el.textContent = JSON.stringify(manager.attributes, null, 2)
  }, 1000)
}

debug()
