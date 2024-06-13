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

### 获取主白板变更事件

```js
manager.events.on('cameraStateChange', (camera) => console.info('视角变更', camera))
manager.events.on('pageStateChange', (state) => console.info('场景变更', state))
```

### 注册 Netless App

可以直接注册 App 定义，或者一个 `Promise`，或者一个函数，或者一个远程脚本地址。对于函数和地址形式的 App，只有第一次打开该 App 时会执行和下载 App 定义。

> [!WARNING]
> 通过远程地址加载的方式实质上允许了 XSS 攻击，请通过 CSP 或其他方式确保该脚本可信。

```js
import { register } from '@netless/window-manager'

register({
  kind: 'Counter',
  setup(context) { ... }
})

register(() => import('./counter'))

register({
  kind: 'Counter',
  src: 'url/to/counter.js'
})
```

### 插入 Netless App

你可以在这里通过 `src` 或者 `setup` 顺便注册 App 定义，但是请注意如果远端此时还没有注册那么无法打开该 App。如果是通过 `src` 注册的那么会自动在远端注册。

```js
manager.addApp({
  kind: 'Counter',
  src: 'url/to/counter.js',
  state: { count: 42 },
})
```

App 内可以通过 `context.isAddApp` 和 `context.state` 获取初始化参数。

### NetlessApp 内常用接口

```js
const Counter = {
  kind: 'Counter',
  setup(context) {
    // 是当前用户插入的 App，可以在单个客户端执行一些初始化操作
    context.isAddApp
    context.state // { count: 42 }
    context.now // 约等于服务端的 Date.now()

    // 修改 state，不要直接改 state 对象
    context.setState({ count: 100 })

    // 监听 state 变化
    context.on('stateChanged', () => console.log(context.state.count))

    // 发送广播消息，其他客户端里相同 App 会收到此消息，本地不会收到
    context.dispatchEvent("event", { id: 42 })
    context.addEventListener("event", ({ payload }) => console.log(payload.id))

    // 连接一个新的 storage
    const storage = context.connectStorage('counter', { count: 0 })
    storage.state // { count: 0 }
    storage.setState({ count: 1 })
    storage.on('stateChanged', () => console.log(storage.state.count))

    // 用 `connectStorage()` 时传入的默认数据覆盖当前数据
    storage.resetState()

    // 发送广播消息，其他客户端里相同 App 的同名 storage 会收到此消息
    storage.dispatchEvent("event", { id: 42 })
    storage.addEventListener("event", ({ payload }) => console.log(payload.id))

    // UI 相关
    context.box.mountStyles(document.createElement('style'))
    context.box.mountContent(document.createElement('div'))
    context.box.mountFooter(document.createElement('div'))

    // 关闭窗口时的处理
    context.on('close', () => console.log('exit'))
  }
}
```

## 开源协议

MIT @ [netless](https://github.com/netless-io)
