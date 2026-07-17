---
outline: 2
---

# Redis Adapter 运维

Redis 支撑多个互相独立的 Adapter，并不是必选中央总线。每个 Adapter 拥有自己的
Schema 与 Key Prefix，应用可以同时混用 DNS、SQL、Kubernetes、内存和自定义实现。

## 连接与 Cluster

具体类型提供 Standalone，并在支持时提供 Cluster 专用构造函数。构造方式必须与
实际部署一致，不能假设一个 Cluster URL 的行为和单节点相同。

参与同一原子 Script 的 Key 必须使用兼容 Redis Cluster Hash Tag。应分配明确的
环境/应用 Prefix，避免不兼容部署共享 Namespace。

## Health 与 Readiness

`RedisHealth` 实现 Readiness Probe，并提供 `RedisHealthStats` 与
`SubscriptionStats`。
当 Redis 故障会让新流量不正确或不可用时注册它。临时依赖故障通常应影响
Readiness，而不是 Liveness，以免重启放大事故。

## 运维清单

- 明确连接、命令、Blocking Read 与重连超时。
- 监控延迟、错误、重连、Stream Pending、内存和淘汰策略。
- 正确性关键状态不能被意外淘汰。
- 使用真实拓扑测试 Failover 与订阅恢复。
- 只备份其语义要求持久恢复的数据。

具体一致性与交付保证应查看对应能力页；仅说明“使用 Redis”并不足以描述行为。

## 示例：Readiness

```rust
use std::sync::Arc;

use elura::adapters::redis::RedisHealth;
use elura::prelude::*;

let redis_health = Arc::new(RedisHealth::connect(redis_url).await?);
let gateway = Gateway::new(gateway_config)
    .readiness_probe("redis", redis_health.clone());

// 由应用生命周期监督这个 Future。
// redis_health.run(check_interval, timeout, shutdown).await?;
```

注册 Probe 只会加入 Readiness 计算；应用还必须监督 `RedisHealth::run`，让检查在
整个进程生命周期中持续运行。
