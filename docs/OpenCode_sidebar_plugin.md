# OpenCode 自定义 Sidebar 插件：操作与接口说明

## 1. 目标与边界

本方案用于在 OpenCode 的终端界面侧栏中增加自定义信息展示与交互，例如：

- 任务进度、Checklist、待办
- 子代理、Token、费用、上下文状态
- Git 状态、测试状态、服务健康度
- 项目自定义业务数据与快捷操作

插件通过 OpenCode 的 TUI 插件 API 注册内容区域，不修改 OpenCode 的内部界面，也不通过模拟键盘或终端字符实现交互。

## 2. Sidebar 插槽

OpenCode Sidebar 提供三个主要插槽：

| 插槽 | 用途 | 推荐内容 |
|---|---|---|
| `sidebar_title` | 侧栏顶部标题区域 | 简短状态、徽标、总览 |
| `sidebar_content` | 侧栏主体，可滚动 | 卡片、列表、详情、操作入口 |
| `sidebar_footer` | 侧栏底部 | 版本、状态摘要、快捷提示 |

通常使用 `sidebar_content`。多个插件可注册该区域，并由 `order` 决定大致显示顺序。

## 3. 插件最小结构

```text
my-opencode-sidebar/
├── package.json
├── tsconfig.json
└── src/
    └── index.tsx
```

`package.json` 的关键配置：

```json
{
  "name": "my-opencode-sidebar",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    "./tui": {
      "import": "./dist/index.js",
      "config": { "enabled": true }
    }
  },
  "peerDependencies": {
    "@opencode-ai/plugin": ">=1.14.0",
    "@opentui/core": ">=0.2.0",
    "@opentui/solid": ">=0.2.0",
    "solid-js": ">=1.9.0"
  }
}
```

`./tui` 导出是关键：OpenCode 据此识别该包是一个 TUI 插件。

## 4. 最小可运行示例

```tsx
/** @jsxImportSource @opentui/solid */

import type {
  TuiPlugin,
  TuiPluginApi,
  TuiSlotPlugin,
  TuiSlotContext,
} from "@opencode-ai/plugin/tui"
import { createSignal } from "solid-js"

function createSidebar(api: TuiPluginApi): TuiSlotPlugin {
  const [expanded, setExpanded] = createSignal(true)
  const [count, setCount] = createSignal(0)

  return {
    order: 60,
    slots: {
      sidebar_content(ctx: TuiSlotContext, input: { session_id: string }) {
        return (
          <box
            flexDirection="column"
            borderStyle="rounded"
            borderColor={ctx.theme.current.border}
            paddingLeft={1}
            paddingRight={1}
          >
            <text
              fg={ctx.theme.current.primary}
              onMouseUp={() => setExpanded(!expanded())}
            >
              <b>我的工作面板</b>
            </text>

            {expanded() && (
              <box flexDirection="column">
                <text fg={ctx.theme.current.textMuted}>
                  会话：{input.session_id}
                </text>
                <text onMouseUp={() => setCount(count() + 1)}>
                  点击次数：{count()}
                </text>
              </box>
            )}
          </box>
        )
      },
    },
  }
}

const tui: TuiPlugin = async (api: TuiPluginApi) => {
  api.slots.register(createSidebar(api))
}

export default {
  id: "my-opencode-sidebar",
  tui,
}
```

## 5. 主要可用接口

### 5.1 注册侧栏

```ts
api.slots.register({
  order: 60,
  slots: {
    sidebar_content(ctx, input) {
      return <MyPanel sessionId={input.session_id} theme={ctx.theme.current} />
    }
  }
})
```

- `order`：显示顺序，数值越小通常越靠前。
- `ctx.theme.current`：当前主题颜色。
- `input.session_id`：当前用户正在查看的会话 ID。

### 5.2 监听状态变化

```ts
const unsubscribe = api.event.on("message.part.updated", (event) => {
  // 消息内容、工具调用状态发生改变
})

const unsubscribeIdle = api.event.on("session.idle", (event) => {
  // 会话完成/空闲
})

const unsubscribeError = api.event.on("session.error", (event) => {
  // 会话出现错误
})
```

组件卸载时必须取消订阅：

```ts
onCleanup(() => {
  unsubscribe()
  unsubscribeIdle()
  unsubscribeError()
})
```

典型用途：

- 工具调用开始/结束时刷新面板
- 监听子代理或后台任务状态
- 在生成结束后重新计算 Token、费用、结果摘要

### 5.3 读取当前会话数据

```ts
const session = api.state.session.get(sessionId)
const messages = api.state.session.messages(sessionId)
const todos = api.state.session.todo(sessionId)
const status = api.state.session.status(sessionId)
```

常见字段和用途：

| 接口 | 用途 |
|---|---|
| `session.get(id)` | 会话标题、父会话 ID、费用、代理信息等 |
| `session.messages(id)` | 消息、模型、Token、错误信息 |
| `session.todo(id)` | 待办总数、完成数、取消数 |
| `session.status(id)` | 判断运行中、空闲等状态 |
| `state.part(messageId)` | 读取一条消息下的 tool / subtask 等 Part |

注意：状态数据是异步更新的。对最终 Token 或费用，建议在 `session.idle` 事件触发后延迟一次短暂读取，再写入展示状态。

### 5.4 持久化插件设置与数据

```ts
api.kv.set("my_sidebar.open", true)

const isOpen = api.kv.get("my_sidebar.open", true)
```

建议的键命名：

```text
my_sidebar.open
my_sidebar.settings
my_sidebar.session_data
```

建议持久化：

- 折叠状态、排序、筛选、语言等用户偏好
- 当前会话相关的缓存数据
- 必要的历史汇总数据

不要持久化：

- 高频、瞬时的动画状态
- 可随时从 OpenCode 状态接口重新计算的数据
- 秘钥、访问令牌、敏感业务内容

### 5.5 注册斜杠命令

```ts
api.command?.register(() => [
  {
    title: "My Sidebar: Toggle",
    value: "my-sidebar-toggle",
    description: "Show or hide the sidebar panel",
    slash: { name: "my-sidebar-toggle" },
    onSelect: (dialog) => {
      // 更新状态或打开选择框
      dialog?.clear()
    },
  },
])
```

建议提供的命令：

| 命令 | 用途 |
|---|---|
| `/my-sidebar-toggle` | 折叠/展开面板 |
| `/my-sidebar-refresh` | 主动刷新数据 |
| `/my-sidebar-settings` | 修改筛选、显示密度、语言等 |
| `/my-sidebar-clear` | 清除当前会话缓存 |

### 5.6 页面跳转与通知

跳转至某个会话：

```ts
api.route.navigate("session", { sessionID: childSessionId })
```

显示通知：

```ts
api.ui.toast({
  title: "刷新完成",
  message: "已更新任务状态",
  duration: 3000,
})
```

### 5.7 弹窗选择与确认

```tsx
dialog?.replace(() => (
  <api.ui.DialogSelect
    title="选择显示模式"
    options={[
      { title: "紧凑", value: "compact" },
      { title: "详细", value: "detail" },
    ]}
    onSelect={(option) => {
      // 保存 option.value
      dialog?.clear()
    }}
  />
))
```

适合用于设置项、筛选条件、清空确认等交互，避免在窄侧栏中塞入复杂控件。

## 6. UI 组件与交互

插件使用 OpenTUI + SolidJS 的 JSX 组件，常见元素：

```tsx
<box flexDirection="column" paddingLeft={1}>
  <text fg={theme.primary}>标题</text>
  <text onMouseUp={handleClick}>可点击文本</text>
  <span style={{ fg: theme.success }}>● 正常</span>
</box>
```

常用属性：

| 属性 | 作用 |
|---|---|
| `flexDirection="column"` | 垂直布局 |
| `paddingLeft` / `paddingRight` | 内边距 |
| `borderStyle="rounded"` | 圆角边框 |
| `fg` / `bg` | 前景/背景色 |
| `onMouseUp` | 鼠标点击处理 |
| `onMouseOver` / `onMouseOut` | 悬浮状态 |
| `Show` / `For` | 条件和列表渲染 |

设计建议：

- 侧栏宽度有限：标题简短，详情通过折叠或弹窗展示。
- 频繁刷新时保留稳定的条目 ID，避免列表跳动。
- 长文本要截断；中文和 Emoji 的终端显示宽度需单独处理。
- 不要在渲染函数里执行网络请求、文件扫描或耗时计算。

## 7. 推荐的状态模型

```ts
type PanelEntry = {
  id: string
  title: string
  status: "running" | "done" | "error"
  startedAt: number
  endedAt?: number
  sessionId?: string
  detail?: string
}
```

推荐数据流：

```text
OpenCode 事件
  → 更新 SolidJS signal / Map
  → 立即重绘 Sidebar
  → 防抖写入 api.kv
  → 重启或切换会话时，从 api.kv 恢复
  → 再通过 api.state 做一次校正
```

## 8. 实现限制与风险

- TUI API 和事件字段可能随 OpenCode 版本变化，应锁定并测试目标版本。
- 只把 `api.state` 视作读取源；对于缺失或延迟的数据，要有空值和重试处理。
- 高频轮询会影响终端体验。建议仅在存在运行中条目时轮询，间隔不少于 500ms。
- 事件可能错过或乱序。需要在会话切换、插件加载时扫描一次历史状态并进行校正。
- 一个插件应只负责一个清晰面板，复杂操作应优先通过命令或弹窗完成。

## 9. 需求确认模板

在开发前，请明确以下内容：

1. 面板的核心目标：监控、操作、汇总，还是提醒？
2. 数据来自哪里：OpenCode 会话、Git、本地文件、HTTP API 或 MCP？
3. 是否需要跨会话保存历史？
4. 用户要执行哪些操作：仅查看、跳转、确认、编辑、触发外部动作？
5. 刷新要求：事件实时、定时刷新，还是手动刷新？
6. 敏感数据与权限边界是什么？
7. 期望的层级：标题摘要、列表卡片、展开详情、弹窗配置分别放什么？

## 10. 参考实现

- OpenCode SubAgent Magazine：实时事件监听、KV 持久化、命令、会话跳转和侧边栏卡片的完整示例  
  https://github.com/Hotakus/opencode-subagent-magazine

- OpenCode 内置 Sidebar：三个 Sidebar 插槽的宿主位置  
  https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx
