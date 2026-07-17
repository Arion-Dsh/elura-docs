---
outline: 2
---

# 自定义 Adapter

Elura Runtime 依赖对象安全的能力契约。只需实现所需 Trait，并注入 Gateway、World、
HTTP 服务或 Worker；不需要切换一个全局 Backend。

| 能力 | 契约 |
| --- | --- |
| World 发现/注册 | `WorldDiscovery`、`WorldRegistrar` |
| 账户版本 | `AccountVersionStore`、`MutableAccountVersionStore` |
| 在线 Session 生命周期 | `OnlineDirectory` |
| 在线统计 | `OnlineStatsReader` |
| 完整在线 Backend | `OnlineBackend` |
| OTP Challenge | `OtpStore` |
| 票据 Replay | `ReplayStore` |
| Push | `PushTransport`、`PushTargetResolver` |
| 会话控制 | `SessionControlTransport` |
| Player Cache 失效 | `InvalidationBus` |
| 持久投递 | `OutboxStore`、`IdempotencyStore` |
| Gateway Admission | `AdmissionController` |

## 实现规则

- 不仅实现方法签名，还要保持契约的原子性与 Shutdown 语义。
- 验证 Namespace、ID、Duration 与不可信 Payload 大小。
- 长运行 Subscriber 应在契约内部处理瞬时重连。
- 明确交付保证，需要时让重复投递安全。
- 暴露 Readiness 与有用 Counter，但不记录密钥或 Payload。
- 测试并发、取消、Lease 过期、Fencing 与 Backend Failover。

应用专有实现应放在应用或独立 Crate，并在组合位置显式导入，让基础设施选择可以
被审查。

## 贡献到上游

当 Adapter 支持通用数据库、Broker、服务注册中心或部署平台时，应优先贡献到
Elura，避免多个应用长期维护平行副本。

Adapter PR 应包括：

- 默认不启用的独立 Feature 和明确依赖边界；
- 原子性、一致性、交付、取消与 Shutdown 语义说明；
- 依赖故障影响正确性时的 Readiness 与有用运维 Counter；
- 适用的并发、Lease 过期、Fencing、重连、重复投递与 Failover 测试；
- 不让默认测试套件依赖外部服务的 Opt-in Integration Test；
- Public API 覆盖、Rustdoc 以及同步的中英文目录说明。

Cluster 或分布式实现必须按真实拓扑假设验证，包括 Key Placement 与 Failover 行为。

## 示例：Replay Store 骨架

```rust
use async_trait::async_trait;
use elura::prelude::{ReplayStore, Result};

struct DatabaseReplayStore;

#[async_trait]
impl ReplayStore for DatabaseReplayStore {
    async fn reserve(&self, ticket_id: &str, expires_at: u64) -> Result<bool> {
        // 必须由一次原子的 insert-if-absent 决定唯一获胜者。
        application_database_reserve(ticket_id, expires_at).await
    }
}
```

数据库操作必须只向一个并发调用者返回 `true`；Backend 不可用时必须返回错误，
不能返回 `true`。
