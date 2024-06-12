# @netless/window-manager

[Agora 互动白板](https://www.npmjs.com/package/white-web-sdk) 多窗口模式。

## 安装和使用

<pre>npm add white-web-sdk <strong>@netless/window-manager</strong></pre>

```js
import { WhiteWebSdk } from 'white-web-sdk'
import { useInvisiblePlugin, createWindowManager } from '@netless/window-manager'

let p = useInvisiblePlugin('WindowManager') // <-- (1)

let sdk = new WhiteWebSdk({
  appIdentifier: import.meta.env.VITE_APPID,
  useMobXState: true,
  region: import.meta.env.VITE_REGION,
})

let room = await sdk.joinRoom({
  uid: Math.random().toString(16).slice(2),
  uuid: import.meta.env.VITE_ROOM_UUID,
  roomToken: import.meta.env.VITE_ROOM_TOKEN,
  invisiblePlugins: [p.class], // <-- (2)
  useMultiViews: true,
})

let manager = createWindowManager(p.initialize(room)) // <-- (3)

document.querySelector('#whiteboard')?.appendChild(manager.dom) // <-- (4)
```

- (1) (2) 声明并注册插件
- (3) 构造 window manager 实例
- (4) 渲染到页面上，此步骤代替了原 SDK `room.buildHtmlElement()` 调用

上面代码中 `import.meta.env.VITE_*` 变量是你需要自己从后端获取的；`joinRoom()`
里的 `uid` 建议使用具体业务里的用户唯一标识。另外，`useMobXState` 和 `useMultiViews` 选项必须打开。

### 配置

你可以在 `createWindowManager()` 时直接传入配置项，或者在构造出 `manager` 后调用上面的 `setXXX()` 方法来调整配置，在进入白板房间后随时都可以调用。

```js
let manager = createWindowManager({
  room,
  plugin$: p.initialize(room),
  // ... 配置项 ...
  readonly: true,
})
// 动态修改配置项
manager.setReadonly(true)
```

## 开源协议

MIT @ [netless](https://github.com/netless-io)
