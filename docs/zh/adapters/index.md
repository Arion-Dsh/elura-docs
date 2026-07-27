---
outline: 2
---

# Adapters

Adapter 将 Elura 的能力契约连接到基础设施。它们按应用能力而不是厂商分组：同一个
应用完全可以用 DNS 做发现、Redis 管理在线会话、SQL 保存 Outbox。

```text
Gateway / World / Worker
          |
       核心契约
          |
     基础设施 Adapter
```

Redis、SQL 与 Kubernetes 都是实现，不是框架必需组件。Gateway 到 World 的应用
流量仍然通过 ELR2 直连。

## 能力目录

| 分类 | 核心契约 | 内置实现 |
| --- | --- | --- |
| [服务发现](./discovery) | `WorldDiscovery`、`WorldRegistrar` | DNS、Redis、Kubernetes Endpoints |
| [共享状态](./state) | 账户版本、在线目录、OTP、Replay | 各能力分别支持内存、Redis、SQL |
| [在线状态](./online) | `OnlineDirectory`、`OnlineStatsReader`、`OnlineBackend` | 内存、Redis、自定义 |
| [消息与控制](./messaging) | `PushTransport`、`SessionControlTransport`、`InvalidationBus` | 适用时进程内、Redis Streams/PubSub |
| [准入控制](./admission) | `AdmissionController` | Realm 策略、Redis 分布式策略 |
| [Outbox](./outbox) | `OutboxStore`、`IdempotencyStore` | 内存、Redis、PostgreSQL、MySQL |
| [Kubernetes](./kubernetes) | 发现、Leader、Ownership | EndpointSlice 与 Lease Controller |
| [Redis 运维](./redis) | Readiness 与连接行为 | Standalone 与 Cluster Adapter |
| [自定义](./custom) | 公开扩展 Trait | 应用实现 |

::: tip 欢迎贡献通用基础设施支持
如果一个 Adapter 为数据库、Broker、Registry 或平台提供通用语义，建议提交到上游，
让契约、故障行为、测试与运维说明一起维护。参见
[自定义 Adapter](./custom#贡献到上游)。
:::

## Feature 边界

```toml
# 契约模块与 DNS Discovery
elura = { version = "0.3.1", features = ["adapters"] }

# 只添加实际使用的基础设施
elura = { version = "0.3.1", features = ["redis", "sql", "kubernetes"] }
```

具体类型位于 `elura::adapters`，并且不会进入 Prelude，这让 Redis、SQL 或
Kubernetes 依赖在组合代码中保持可见。

## 最小组合示例

下面的 Gateway 组合了两个 Redis 能力，但它们仍是独立注入槽位，可以分别替换：

```rust
use std::{sync::Arc, time::Duration};

use elura::adapters::online::RedisOnlineDirectory;
use elura::adapters::replay::RedisReplayStore;
use elura::prelude::*;

let replay = Arc::new(
    RedisReplayStore::connect(redis_url, "game:ticket-replay").await?,
);
let online = Arc::new(
    RedisOnlineDirectory::connect(redis_url, "game:online", Duration::from_secs(60)).await?,
);

let online_config = GatewayOnlineConfig::new(
    "gateway-1",
    Duration::from_secs(60),
    Duration::from_secs(20),
    DuplicateLoginMode::RejectNew,
);

let gateway = Gateway::new(gateway_config)
    .replay_store(replay)
    .online_directory(online, online_config);
```

这段代码只组装能力。还需要按搭建指南添加客户端 Transport、World Client 或
Discovery，并调用 `run`。

## 选择原则

从进程内状态和平台原生发现开始。只有某项行为必须跨副本或跨进程替换保留时，
才加入共享基础设施。应逐项能力选择实现，不要求所有能力使用同一个后端。
