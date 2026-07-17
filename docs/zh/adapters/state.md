---
outline: [2, 3]
---

# 共享状态 Adapter

这些 Adapter 分别实现不同的一致性领域。应按契约选择后端，而不是把“分布式状态”
当成一个数据库开关。

## 账户版本

`AccountVersionStore` 提供用于废止旧会话的 Generation，
`MutableAccountVersionStore` 负责变更。内置实现包括：

- 单进程 `MemoryAccountVersionStore`；
- `redis` Feature 的 `RedisAccountVersionStore`；
- `sql` Feature、支持 PostgreSQL/MySQL 的 `SqlAccountVersionStore`。

SQL Adapter 提供 `ensure_schema`。迁移应由受控启动或部署 Owner 执行，不要让所有
副本无协调地同时迁移。

## 在线目录

`OnlineDirectory` 管理 Session Lease、查询、分组和重复登录 Fencing。
`OnlineStatsReader` 返回指定 Region/Realm 的 Session 数和去重用户数。
`OnlineBackend` 组合两个能力；同时实现两个窄 Trait 的类型会自动实现它。

Lease TTL 需要容忍短暂停顿，又不能让死亡会话长期保持在线。`KickExisting` 还
需要兼容的[会话控制传输](./messaging)。

完整契约、Gateway 注入、在线人数、生命周期 Observer 和自定义 Backend 参见
[在线状态 API](./online)。

## OTP 存储

`OtpStore` 原子创建 Challenge 并验证/消费尝试。`MemoryOtpStore` 是进程内实现；
多个 API 副本共享 Challenge Namespace 时应使用 `RedisOtpStore` 或自定义共享实现。

Store 负责原子性与 Cooldown，按 IP、接收者和全局限流仍属于应用 API。参见
[OTP Provider](/zh/providers/otp)。

## 票据防重放

`ReplayStore` 防止一次性 Gateway 票据被重复接受。只有同一票据 Namespace 的验证
始终落到单进程时，`MemoryReplayStore` 才正确；多个 Gateway 应使用
`RedisReplayStore` 或其他共享实现。

## 示例：构造共享 Store

```rust
use std::time::Duration;

use elura::adapters::account_version::SqlAccountVersionStore;
use elura::adapters::online::RedisOnlineDirectory;
use elura::adapters::replay::RedisReplayStore;

let replay = RedisReplayStore::connect(redis_url, "game:ticket-replay").await?;
let online = RedisOnlineDirectory::connect(
    redis_url,
    "game:online",
    Duration::from_secs(60),
).await?;

let account_versions = SqlAccountVersionStore::connect_postgres(postgres_url).await?;
account_versions.ensure_schema().await?;
```

构造 Store 不等于启用它们。应将 `replay`、`online` 注入 Gateway，并在执行账户
版本策略的位置注入 `account_versions`。
