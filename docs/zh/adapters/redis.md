---
outline: [2, 3]
---

# Redis Adapter 运维

Redis 支撑多个互相独立的 Adapter，并不是必选中央总线。每个 Adapter 拥有自己的
Schema 与 Key Prefix，应用可以同时混用 DNS、SQL、Kubernetes、内存和自定义实现。

## 连接与 Cluster

具体类型提供 Standalone，并在支持时提供 Cluster 专用构造函数。构造方式必须与
实际部署一致，不能假设一个 Cluster URL 的行为和单节点相同。

参与同一原子 Script 的 Key 必须使用兼容 Redis Cluster Hash Tag。应分配明确的
环境/应用 Prefix，避免不兼容部署共享 Namespace。

### 使用示例

对支持多 Key 原子操作的 Adapter，应使用 Cluster 专用构造函数：

```rust
use std::time::Duration;

use elura::adapters::online::RedisOnlineDirectory;
use elura::adapters::replay::RedisReplayStore;
use elura::adapters::session_control::{
    RedisSessionControlBus, RedisSessionControlConfig,
};

let nodes = ["redis://redis-0:6379", "redis://redis-1:6379"];
let replay = RedisReplayStore::connect_cluster(
    nodes.iter().copied(),
    "game:{tickets}:replay",
).await?;
let online = RedisOnlineDirectory::connect_cluster(
    nodes.iter().copied(),
    "game:{online}",
    Duration::from_secs(60),
).await?;
let control = RedisSessionControlBus::connect_cluster(
    nodes.iter().copied(),
    "gateway-1",
    RedisSessionControlConfig::default(),
).await?;
```

同一 Lua Script 或 Transaction 使用的 Key 必须位于同一 Hash Slot。Adapter 会在
支持时标准化 Prefix，但应用传入的 Stream 名仍需要兼容的 Hash Tag。

## Health 与 Readiness

`RedisHealth` 实现 Readiness Probe，并提供 `RedisHealthStats` 与
`SubscriptionStats`。
当 Redis 故障会让新流量不正确或不可用时注册它。临时依赖故障通常应影响
Readiness，而不是 Liveness，以免重启放大事故。

### 使用示例

```rust
use std::sync::Arc;

use elura::adapters::redis::RedisHealth;
use elura::prelude::*;

let redis_health = Arc::new(RedisHealth::connect(redis_url).await?);
let gateway = Gateway::new(gateway_config)
    .readiness_probe("redis", redis_health.clone());

// 由应用生命周期监督这个 Future。
// redis_health.run(shutdown, check_interval, timeout).await?;
```

注册 Probe 只会加入 Readiness 计算；应用还必须监督 `RedisHealth::run`，让检查在
整个进程生命周期中持续运行。

## 运维清单

- 明确连接、命令、Blocking Read 与重连超时。
- 监控延迟、错误、重连、Stream Pending、内存和淘汰策略。
- 正确性关键状态不能被意外淘汰。
- 使用真实拓扑测试 Failover 与订阅恢复。
- 只备份其语义要求持久恢复的数据。

具体一致性与交付保证应查看对应能力页；仅说明“使用 Redis”并不足以描述行为。
