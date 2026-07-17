---
outline: [2, 3]
---

# Outbox Adapter

`OutboxStore` 提供持久 Append、Lease、Ack、Retry、Dead Letter 与 Replay。
`OutboxDispatcher` 负责运行 Handler；Gateway 和 World Launcher 按设计不会自动
替应用启动它。

## 实现

### Memory

`MemoryOutbox` 适合测试和单进程流程，不会跨进程替换保留，也不能与应用数据库
事务原子提交。

### Redis

`RedisOutbox` 提供共享 Lease 与 Retry State，适合把 Redis 作为该事件链路的持久
边界、且不需要与 SQL 业务写原子提交的场景。

`RedisIdempotencyStore` 提供 Handler 幂等状态；TTL 应覆盖最长 Retry/Replay 窗口。

### PostgreSQL 与 MySQL

`SqlOutbox` 支持两种数据库，提供 `ensure_schema`，并通过
`append_postgres_tx` / `append_mysql_tx` 将业务变更与 Event 放入调用方同一事务。
业务记录本来就在同一 SQL 数据库时，应优先采用这个模式。

## 管理接口

启用 `admin` 后，`OutboxAdmin` 提供列出和重放 Dead Letter 的相对 Axum Route。
`OutboxAdminConfig` 限制列表与请求大小。必须挂载到经过认证的内部 Namespace；
它本身不添加认证。

## Dispatcher 运维

- 为每个 Worker 分配稳定唯一身份。
- Lease Duration 应高于正常 Handler 延迟，长任务需要续租。
- Handler 必须幂等，并区分可重试失败。
- 监控 Dead Letter、Lease Loss、Lag 与最旧可用 Event。
- 随应用生命周期优雅关闭 Dispatcher。

## 示例：SQL Outbox

```rust
use elura::adapters::outbox::SqlOutbox;
use elura::core::outbox::{OutboxEvent, OutboxStore};

let outbox = SqlOutbox::connect_postgres(postgres_url).await?;
outbox.ensure_schema().await?;

let event = OutboxEvent::new("player.entitlement-granted", payload)?;
outbox.append(event).await?;
```

业务写需要原子提交时，应在同一个 `sqlx` Transaction 中调用
`SqlOutbox::append_postgres_tx`，而不是在事务提交后再调用 `append`。
