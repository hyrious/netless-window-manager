## Window Manager 架构文档

`white-web-sdk` 提供了用于同步数据的 `InvisiblePlugin` 和可以同时展示多个白板的[多视图模式](https://developer.netless.link/javascript-zh/home/multiview)，加上广播消息、同步时间戳等功能，可以利用他们实现大部分同步互动场景。核心实现都在 [`window-manager.tsx`](./window-manager.tsx) 里，本文档主要解释一下同步数据方面的设计和实现。

### 同步机制

现有的同步基建有以下几种：

- `room.state.globalState` 为深度一层的单个对象，可以用于实现结构相对简单的同步任务。
- `room.dispatchMagixEvent()` 可以用于发送广播消息，注意中途进入的用户不会收到之前发过的消息，他只能收到进入房间后的消息。另外，如果他中途断线了，断线期间的消息也收不到。
- `InvisiblePlugin` 可以用于存储任意深度的对象，通过 `updateAttributes()` 可以更新任意层级的数据，粒度最细。打开 `useMobXState` 再通过 `autorun()` 等工具函数可以监听任意层级的变更，中途进入或断线也不会影响状态的最终一致性。
- `room.calibrationTimestamp` 可以视为服务器时间，他会尽量在所有端保持一致。

因此我们发现，如果要保证一定程度的强一致性，起码要通过 `InvisiblePlugin` 来持久化数据。下面就针对 Window Manager 里的各个子功能解释一下他都存了什么数据。

#### 坑：`InvisiblePlugin` 可以被销毁

`InvisiblePlugin.attributes` 就是带持久化的同步对象，这个对象身上有个 id 用于同步服务识别和运作。当有人调用 `destory()` 销毁这个对象时，此前挂载的 `autorun()` 等监听器都无法工作，必须重新挂载。

为了简化一下这个问题，[`invisible-plugin.ts`](./invisible-plugin.ts) 构造了可以**观测**的插件对象，并且在插件不存在或者被销毁时返回一个空的假对象方便外面读取数据。同时，他会在房间退出（`disconnected`）前不断检测插件的存在，不存在时自动创建出一个插件实例。

现在我们有了固定存在的插件实例，接下来只需要构造一个能正常工作的监听器即可，考虑以下 MobX 写法：

```js
reaction(() => plugin.attributes.key, (value) => {})
```

只要在插件实例变化时重新挂载：

```js
dispose = () => void 0
plugin$.subscribe(plugin => {
  dispose()
  dispose = reaction(() => plugin.attributes.key, (value) => {})
})
```

不过上面的代码有一个小坑，就是插件实例变化时大概率 `attributes` 已经变了（比如被销毁的话就是变空对象了）。此时应该固定要触发一次 reaction 的回调。我们可以借助 MobX 自带的 `fireImmediately` 配置来实现这一点：

```js
options = {}
dispose = () => void 0
plugin$.subscribe(plugin => {
  dispose()
  dispose = reaction(() => plugin.attributes.key, (value) => {}, options)
  options.fireImmediately = true
})
```

好了，核心问题已经解决，接下来直接设计同步数据。

### 主白板视角同步

为了让所有端的白板可视区域一致，显然，白板的比例需要是固定的，例如 16:9。当这个值一致时只需要知道一个宽度或者高度就可以计算白板区域矩形了，因此设计状态如下：

```js
attributes.camera = { centerX, centerY, scale, id }
```

其中，`scale` 是一个理论值而不是本地实际的值。考虑一个屏幕为 100x100，另一个为 200x200，对于同一个 scale = 1，他们应该渲染出恰好呈 2 倍关系的视角。另外 `id` 是指当前操作视角用户的 `room.observerId`，操作者不应该触发他的视角跟随动画，可以用这个 `id` 来实现。

因此，在端上应该有两个常数用于计算实际视角，一个是比例，另一个是“当白板的实际像素宽度为某值时，其实际 scale 为 1”里的“某值”。不妨取 1280，接下来我们验算一下：

```js
let scale = 1
// 对于 100x100 的白板，根据 16:9 的限制，它实际渲染的白板像素宽度为 100
// 当白板像素宽度为 1280 时他的 scale = 1，那么
let scale1 = scale * 100 / 1280
// 对于 200x200 的白板，其实际 scale 为
let scale2 = scale * 200 / 1280
```

可以看到是正确的。这么一来，就算房间一开始没有一个人有可写权限，他们的视角也是正确的。

### Netless App 同步

对于 Netless App 窗口应用，其窗口位置相对于整个白板按比例定位：

```js
attributes.apps[appId].position = { x, y, width, height, z } // 0.01 ~ 0.99
attributes.apps[appId].createdAt = room.calibrationTimestamp
```

注意到其中有个 `z`，它用于维护窗口间层级关系，`z` 有一定概率重复（比如同时有两个人创建了新窗口），此时回退到按 `createdAt` 比较层级。切换 app 时，将对应 app 的 `z` 提到最大值 + 1。

App 上可以创建白板，可以自由控制白板的视角。这件事可以直接通过暴露 `createView()` 等接口实现。可以提供一些常见同步场景的同步策略按需使用，这里先不解释，

#### App 内状态同步

可以接入 `@netless/synced-store` 实现。

```js
attributes[kStorage][appId] = new Refine()
attributes[kStorage][appId:namespace] = new Refine()
```
