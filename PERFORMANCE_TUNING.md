# 性能调优指南

## 问题描述
在资源受限的机器上（如腾讯云新加坡 2 核节点），每 10 秒的频繁 CLI 轮询会 spawn 多个 Node.js 进程（每个 ~200MB），导致 CPU 飙升至 80-92% 并面临 OOM 风险。

## 解决方案：CLI 结果缓存

### 默认配置（推荐）
应用默认使用 **内存缓存**，TTL 为 24 小时：

```bash
npm run dev:ui  # 自动使用 OpenClawCachedClient
```

**效果**：CLI spawn 从每 10 秒一次降低到每 24 小时一次，CPU 恢复至接近空闲。

### 配置选项

#### 1. 适配器选择 (ADAPTER_TYPE)
- `cached`（默认）：内存缓存，最少化 CLI spawn
- `live`：直接调用 CLI，无缓存（传统/高资源模式）

```bash
# 使用缓存适配器（默认，推荐）
ADAPTER_TYPE=cached npm run dev

# 使用实时适配器（频繁轮询，高 CPU）
ADAPTER_TYPE=live npm run dev
```

#### 2. 缓存时长 (CACHE_TTL_MS)
仅在使用 `ADAPTER_TYPE=cached` 时有效。默认：24 小时（86400000 毫秒）

```bash
# 缓存 1 小时（而非 24 小时）
CACHE_TTL_MS=3600000 npm run dev

# 缓存 30 分钟
CACHE_TTL_MS=1800000 npm run dev
```

#### 3. 单独调整轮询间隔
按数据源细粒度调整轮询频率：

```bash
# 会话列表轮询改为 30 秒
POLLING_INTERVAL_SESSIONS_LIST_MS=30000 npm run dev

# 待审批列表轮询改为 30 秒
POLLING_INTERVAL_APPROVALS_MS=30000 npm run dev

# Cron 任务轮询改为 30 秒
POLLING_INTERVAL_CRON_MS=30000 npm run dev
```

### 综合配置示例
```bash
# 2 核小机器：24 小时缓存 + 保守轮询
ADAPTER_TYPE=cached \
  CACHE_TTL_MS=86400000 \
  POLLING_INTERVAL_SESSIONS_LIST_MS=30000 \
  POLLING_INTERVAL_APPROVALS_MS=30000 \
  npm run dev:ui
```

### 生产环境部署
在 `.env.production` 中添加：
```
ADAPTER_TYPE=cached
CACHE_TTL_MS=86400000
POLLING_INTERVAL_SESSIONS_LIST_MS=30000
POLLING_INTERVAL_APPROVALS_MS=30000
MONITOR_CONTINUOUS=true
```

然后启动应用：
```bash
npm run dev:continuous
```

## 权衡对比

| 指标 | 缓存模式（默认） | 实时模式 |
|------|-----------------|---------|
| CPU 占用 | 接近空闲 | 80-92%（2 核） |
| CLI spawn | 每 24 小时 1 次 | 每 10-30 秒 |
| 数据陈旧度 | 最多 24 小时 | 实时 |
| 内存占用 | ~10-50MB | 极小 |
| 适用场景 | 仪表板、监控 | 实时状态追踪 |

## 监控检查

检查正在使用的适配器：
```bash
npm run dev 2>&1 | grep "using client:"
# 输出: [mission-control] using client: OpenClawCachedClient
```

检查轮询配置：
```bash
npm run dev 2>&1 | grep -A 10 "pollingIntervalsMs"
```

## 实现细节

### 修改的文件
- `src/clients/openclaw-cached-client.ts` - 新增缓存层
- `src/clients/factory.ts` - 适配器选择逻辑
- `src/config.ts` - 轮询间隔环境变量解析
- `src/index.ts` - 启动时的适配器日志输出

### 缓存行为
- 为每个数据源单独维护 TTL 缓存
- 审批操作时自动失效相关缓存
- 基于过期时间的优雅刷新机制

## 性能指标

- **CPU 占用** 从 80-92% 降低至接近 0%（空闲时）
- **进程 spawn** 从每 10 秒一次降低至每 24 小时一次
- **内存占用** 稳定在 ~10-50MB（缓存）
- **可靠性** OOM 风险消除
