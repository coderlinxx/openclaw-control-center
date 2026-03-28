# CLAUDE.md

本文件为在此仓库工作的 Claude Code (claude.ai/code) 提供指导。

## 项目概述

OpenClaw 控制中心是 OpenClaw 的安全优先、本地优先控制面板。设计为默认只读，通过本地 OpenClaw Gateway 通信展示：
- 系统状态、活跃工作者、卡住的任务和预算消耗
- 用量趋势和成本分析
- 会话历史和执行链
- 跨会话的智能体协作
- 任务审批和审计追踪

## 常见开发命令

### 构建与测试
- `npm run build` — 将 TypeScript 编译到 dist/
- `npm test` — 运行测试套件（Node 原生测试运行器）
- `npm run smoke:ui` — UI 启动烟测（验证 express 服务器绑定）
- `npm run release:audit` — 发布前审计（发布前必须运行）

### 运行应用程序
- `npm run dev` — 单次监控循环，不启动 UI
- `npm run dev:continuous` — 监控循环，不启动 UI（设置 `MONITOR_CONTINUOUS=true`）
- `npm run dev:ui` — 启动 HTTP UI 服务器（推荐使用，优于 `UI_MODE=true npm run dev`）

### 命令模式操作
这些命令运行单个操作后退出。若 `LOCAL_TOKEN_AUTH_REQUIRED=true` 需要 `LOCAL_API_TOKEN`：
- `npm run command:backup-export` — 导出运行时状态包
- `npm run command:import-validate -- runtime/exports/<file>.json` — 验证导入包
- `npm run command:acks-prune` — 清理 `runtime/acks.json` 中过期的确认
- `npm run command:task-heartbeat` — 运行任务健康检查
- `npm run validate:task-store` — 验证任务存储完整性
- `npm run validate:budget-compute` — 验证预算计算

### Cron 与健康监控
- `npm run lock:status` — 检查分布式锁状态
- `npm run lock:acquire` / `lock:renew` / `lock:release` — 管理锁
- `npm run watchdog:run` — 编排看门狗监控器
- `npm run health:snapshot` — 捕获当前时间点的健康状态
- `npm run health:snapshot:periodic` — 周期性健康快照
- `npm run worker:resident` — 运行驻留工作进程
- `npm run dod:check` — 完成定义（DoD）清单验证

### 头像与证据管理
- `npm run avatars:export` — 导出员工头像偏好
- `npm run evidence:emit` — 发出证据工件
- `npm run evidence:validate` — 验证证据存储

## 架构与核心层

### 核心原则
- **官方优先**：在适配前优先使用 OpenClaw Gateway API（`sessions_list`、`sessions_history`、`cron` 等）
- **安全默认值**：`READONLY_MODE=true`、`LOCAL_TOKEN_AUTH_REQUIRED=true`，变更门关闭
- **本地状态**：所有可变状态存在 `control-center/runtime/*`，从不修改 OpenClaw home
- **架构验证**：所有变更端点进行请求/响应架构检查

### 源码组织

```
src/
├── index.ts                      # 入口点：CLI/UI 模式路由
├── config.ts                     # 环境变量解析与安全门验证
├── types.ts                      # 共享类型定义
├── clients/                      # Gateway 与工具客户端适配器
│   ├── factory.ts               # 客户端实例化
│   ├── openclaw-live-client.ts  # WS 连接 + sessions/cron API
│   └── tool-client.ts           # 工具执行包装
├── adapters/                     # OpenClaw 接口适配器
│   └── openclaw-readonly.ts     # 会话可见性 + 历史规范化
├── mappers/                      # 数据转换器（原始 API → 领域模型）
│   ├── openclaw-mappers.ts
│   └── session-status-parser.ts # 用量/成本提取
├── runtime/                      # 核心业务逻辑与持久化状态
│   ├── monitor.ts               # 主事件循环
│   ├── snapshot-store.ts        # Gateway 状态快照
│   ├── project-store.ts         # `runtime/projects.json` (CRUD + 架构)
│   ├── task-store.ts            # `runtime/tasks.json` (CRUD + 架构 + 验证)
│   ├── budget-governance.ts     # 用量/成本阈值与状态计算
│   ├── commander-digest.ts      # 日摘要生成
│   ├── commander.ts             # 异常聚合 + 操作员队列
│   ├── approval-action-service.ts  # 审批/拒绝服务（dry-run 门控）
│   ├── agent-roster.ts          # 读取 `~/.openclaw/openclaw.json` + 运行时合并
│   ├── operation-audit.ts       # 导入/导出/ack 操作日志
│   ├── audit-timeline.ts        # 统一事件时间线
│   ├── import-live.ts           # 状态变更端点（变更门控）
│   ├── import-dry-run.ts        # 架构与兼容性检查
│   ├── notification-center.ts   # 警报路由与确认
│   ├── ui-preferences.ts        # 用户筛选/显示偏好
│   └── [其他领域模块]
└── ui/                           # Express HTTP 服务器
    └── server.ts                # 路由定义与中间件
```

### 状态文件
全部在 `runtime/` 中（Gateway 永远不会触及）：
- `last-snapshot.json` — 最新监控循环状态
- `timeline.log` — 操作员事件日志 (JSONL)
- `projects.json` — 项目 CRUD 状态（类型化架构）
- `tasks.json` — 任务 CRUD 状态（链接到项目，类型化）
- `budgets.json` — 预算策略覆盖（按范围阈值）
- `acks.json` — 确认状态（过期 + 贪睡支持）
- `approval-actions.log` — 审批尝试审计追踪 (JSONL)
- `operation-audit.log` — 导入/导出/清理操作 (JSONL)
- `digests/YYYY-MM-DD.json` & `.md` — 日摘要快照
- `exports/` & `export-snapshots/` — 时间戳备份包

### 安全与认证

**环境门**（在 `config.ts` 启动时检查）：
- `READONLY_MODE=true` — 阻止所有状态变更（除非请求有显式 `dryRun=true`）
- `LOCAL_TOKEN_AUTH_REQUIRED=true` — 要求 `x-local-token` 或 `Authorization: Bearer` 头
- `APPROVAL_ACTIONS_ENABLED=false` — 除非明确为 true，否则所有审批/拒绝调用都是空操作
- `APPROVAL_ACTIONS_DRY_RUN=true` — 模拟审批动作；写审计条目但不执行
- `IMPORT_MUTATION_ENABLED=false` — 除非显式启用，否则阻止 `/api/import/live`
- `LOCAL_API_TOKEN` — (env) 验证传入请求的令牌值

**受保护路由**（当 `LOCAL_TOKEN_AUTH_REQUIRED=true` 时需要本地令牌）：
- 所有 `POST`/`PATCH` 端点（`/api/projects`、`/api/tasks/:id/status`、`/api/approvals/:id/*`）
- 导入/导出变更路由（`/api/import/live`、`/api/import/dry-run`、`/export/state.json`）
- 命令模式操作（`backup-export`、`import-validate`、`acks-prune`）

### 关键适配器

**监控循环**（`src/runtime/monitor.ts`）：
- 定期轮询 Gateway
- 获取会话 + cron + 状态快照
- 运行预算检查 + 异常聚合
- 每天午夜生成日摘要
- 写入更新的 `runtime/last-snapshot.json`

**会话可见性**（`src/adapters/openclaw-readonly.ts`）：
- 合并 `sessions_list` 与按会话最新历史片段
- 规范化原始历史中的工具事件以用于只读钻取
- 如在代理特定工作区运行，则按代理筛选

**项目/任务存储**（`project-store.ts`、`task-store.ts`）：
- 本地 JSON 文件上的完整 CRUD 操作
- 创建/更新时的架构验证（严格类型）
- 任务通过 `projectId` 链接到项目，有参考完整性检查
- 安全的并发读/更新模式

**预算治理**（`src/runtime/budget-governance.ts`）：
- 按范围（代理、项目、任务）计算 `ok` / `warn` / `over` 状态
- 输入：会话 `tokensIn` + `tokensOut` + 来自 Gateway 的可选 `cost`
- 使用 `runtime/budgets.json` 策略（带验证的默认值）
- 输出供给 `commander-digest` 和 `/api/commander/exceptions`

## 测试与验证

- 测试位于 `test/**/*.test.ts`（带 tsx 的 Node 原生测试运行器）
- 烟测验证 UI HTTP 绑定，无需实时 Gateway
- 发布审计检查敏感环境变量、大型资产和不完整的类型覆盖

## 环境配置

### 必需
- `GATEWAY_URL` — OpenClaw Gateway 的 WebSocket 地址（默认：`ws://127.0.0.1:18789`）

### 可选路径覆盖
- `OPENCLAW_HOME` — OpenClaw 数据主目录（默认：`~/.openclaw`）
- `OPENCLAW_CONFIG_PATH` — `openclaw.json` 的路径（未设置时自动发现）
- `OPENCLAW_WORKSPACE_ROOT` — 工作区根目录（如果 control-center 在代理目录外）
- `OPENCLAW_AGENT_ROOT` — 特定代理工作区（用于旧版记忆/文档支持）
- `CODEX_HOME` — Codex/GPT 订阅数据（默认：`~/.codex`）
- `OPENCLAW_SUBSCRIPTION_SNAPSHOT_PATH` — 订阅快照文件以获取账单数据
- `UI_PORT` — Express 服务器端口（默认：4310）
- `UI_BIND_ADDRESS` — 绑定地址（默认：`127.0.0.1`；代理/容器使用 `0.0.0.0`）

### 数据获取与缓存优化（性能调优）

**适配器选择**（`ADAPTER_TYPE`，默认：`cached`）：
- `cached` — OpenClawCachedClient：在内存中缓存 CLI 结果，减少频繁 spawn（推荐资源受限的环境如 2 核小机器）
- `live` — OpenClawLiveClient：每次查询都调用 CLI 子进程（无缓存，实时但高资源消耗）

**缓存过期时间**（`CACHE_TTL_MS`，仅在 `ADAPTER_TYPE=cached` 时使用，默认：`86400000` = 24 小时）：
- 设置内存缓存的有效期（毫秒）
- 在腾讯云 2 核小机器上，推荐保持 24 小时默认值以最小化 CLI spawn 频率
- 示例：`CACHE_TTL_MS=3600000` 设置为 1 小时缓存

**轮询间隔调整**（毫秒，可独立配置）：
- `POLLING_INTERVAL_SESSIONS_LIST_MS` — 会话列表轮询（默认：10000）
- `POLLING_INTERVAL_SESSION_STATUS_MS` — 单个会话状态（默认：2000）
- `POLLING_INTERVAL_CRON_MS` — Cron 任务列表（默认：10000）
- `POLLING_INTERVAL_APPROVALS_MS` — 待审批列表（默认：2000）
- `POLLING_INTERVAL_CANVAS_MS` — 画布数据（默认：5000）

### 变更与认证
- `READONLY_MODE` — 默认 true；设为 false 以允许实时状态变更
- `LOCAL_TOKEN_AUTH_REQUIRED` — 默认 true；强制本地令牌认证
- `LOCAL_API_TOKEN` — 受保护操作的令牌值
- `APPROVAL_ACTIONS_ENABLED` — 默认 false；允许审批/拒绝执行
- `APPROVAL_ACTIONS_DRY_RUN` — 默认 true；模拟而不执行
- `IMPORT_MUTATION_ENABLED` — 默认 false；允许实时导入应用
- `MONITOR_CONTINUOUS` — 默认 false；连续循环 vs. 一个循环后退出

## API 路由

### 只读（默认无认证）
- `GET /snapshot` — 原始快照 JSON
- `GET /sessions`、`/sessions/:id` — 会话列表/详情
- `GET /cron` — Cron 概览
- `GET /healthz` — 健康状态
- `GET /audit` — 时间线页面/JSON

### 本地令牌保护（当 `LOCAL_TOKEN_AUTH_REQUIRED=true` 时）
- `POST`/`PATCH /api/projects`、`/api/tasks/*` — 项目/任务变更
- `POST /api/import/dry-run`、`/api/import/live` — 导入操作
- `GET /export/state.json` — 状态导出
- `POST /api/approvals/:id/approve|reject` — 审批动作

### 副本/别名路由
- `/api/projects` ≈ `/projects`
- `/api/tasks` ≈ `/tasks`
- `/api/sessions` ≈ `/sessions`
- `/api/audit` ≈ `/audit`

## 关键概念

**指挥室**：顶级状态仪表板（替代"总览"），带代理名单和能力矩阵。

**像素办公室**：代理/区域占用可视化（替代仅会话分组）。

**任务控制 v3**：带令牌化设计系统（颜色、间距、阴影、动画）的精致 UI。

**代理名单**：从 `~/.openclaw/openclaw.json` 的尽力读取 + 运行时合并，显示所有已知代理，不仅是实时会话。

**操作审计**：导入/导出/ack 操作的单独日志；不同于审批动作 + 时间线事件。

**约束**：
- 仅修改 `control-center/` 目录中的文件
- 永远不修改 `~/.openclaw/openclaw.json` 或 Gateway 配置
- 所有高风险写入默认禁用
- 摘要是 `runtime/digests/*` 下的本地工件

## 实现技巧

1. **添加新端点时**：在 `ui/server.ts` 中添加路由，在 `runtime/` 中实现处理程序，如果是领域类型则通过 `types.ts` 导出。

2. **添加状态变更时**：在相应的存储中实现（`project-store`、`task-store` 等），写入前验证架构，始终写入 `runtime/`，永不写入 OpenClaw home。

3. **查询 Gateway 时**：使用 `src/clients/factory.ts` 中的客户端工厂，执行写操作前检查 `READONLY_MODE` + 认证门。

4. **调试实时模式时**：设置 `READONLY_MODE=false`、`LOCAL_TOKEN_AUTH_REQUIRED=false`（仅本地），并设置 `IMPORT_MUTATION_ENABLED=true` + 提供 `LOCAL_API_TOKEN` 用于测试。

5. **发布/审计时**：推送前始终运行 `npm run release:audit`；它检查环境泄露、类型覆盖和大型资产。
