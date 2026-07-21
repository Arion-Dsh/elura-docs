---
outline: [2, 3]
---

# 在线状态 API

Elura 将在线状态建模为会过期的已认证 Session Lease。Gateway 负责 Lease 生命周期，
基础设施 Adapter 负责存储和查询；应用通过公开契约实现玩家状态、在线人数和业务投影。

## 能力模型

API 按职责拆分：

| 契约 | 职责 |
| --- | --- |
| `OnlineDirectory` | 原子准入、续租、移除、定位和分组存活的 Session Lease |
| `OnlineStatsReader` | 查询指定 Region/Realm 的 Session 数和去重用户数 |
| `OnlineBackend` | 同时包含上述两个能力的便利组合 |
| `SessionObserver` | 接收进程内 Session 生命周期变化 |

`OnlineBackend` 使用 Blanket Implementation。任何同时实现 `OnlineDirectory` 和
`OnlineStatsReader` 的类型都会自动实现 `OnlineBackend`。只需要单项能力的 API
应继续依赖更窄的 Trait。

## 数据类型

`SessionLease` 表示一个已认证 Session：

```rust
pub struct SessionLease {
    pub session_id: Uuid,
    pub gateway_id: String,
    pub identity: Identity,
    pub expires_at: SystemTime,
}
```

`OnlineStats` 是指定 Region 和 Realm 的即时统计：

```rust
pub struct OnlineStats {
    pub session_count: u64,
    pub user_count: u64,
}
```

`session_count` 统计已认证 Session；`user_count` 按 `user_id` 去重。同一玩家使用
两个设备连接时计为两个 Session、一个用户。

`OnlineAdmissionPolicy` 把重复登录策略与该 Session 所属 Region/Realm 的可选
Session 硬上限组合起来；同一次原子操作通过 `OnlineAdmission` 返回 `Accepted`、
`Duplicate` 或 `RealmFull`。

## 内置 Backend

`MemoryOnlineDirectory` 是零依赖参考实现，适合测试、开发和单进程部署。
`RedisOnlineDirectory` 是多 Gateway 共享实现，支持 Redis Standalone 和 Cluster。

```rust
use std::{sync::Arc, time::Duration};

use elura::adapters::online::RedisOnlineDirectory;
use elura::prelude::{OnlineBackend, OnlineDirectory, OnlineStatsReader};

let backend: Arc<dyn OnlineBackend> = Arc::new(
    RedisOnlineDirectory::connect(
        redis_url,
        "game:online",
        Duration::from_secs(45),
    )
    .await?,
);

let directory: Arc<dyn OnlineDirectory> = backend.clone();
let stats: Arc<dyn OnlineStatsReader> = backend;
```

还需要 Readiness 或 Adapter 专有操作时，应保留具体的
`Arc<RedisOnlineDirectory>`；Trait Object 适合应用服务边界。

## 注入 Gateway

Gateway 接收生命周期契约：

```rust
let online_config = GatewayOnlineConfig::new(
    "gateway-shanghai-1",
    Duration::from_secs(45),
    Duration::from_secs(15),
    DuplicateLoginMode::AllowMultiple,
)
.with_realm_capacity(86, 1, 10_000);

let gateway = Gateway::new(config)
    .replay_store(replay)
    .world_client(world)
    .online_directory(directory.clone(), online_config);
```

Lease 时间必须满足：

```text
0 < renew_interval < lease_ttl
```

认证过程中 Gateway 原子执行重复登录与 Realm 容量策略，并注册获准的 Lease；
之后定期续租，连接结束时注销。Gateway 未执行清理就消失时，Adapter 必须在 TTL
后停止返回该 Lease。

应用通常只调用查询方法。`acquire`、`renew` 和 `unregister` 由 Gateway 管理。

## 查询 Session 与在线人数

查询某个玩家的全部存活 Session：

```rust
let sessions = directory
    .user_sessions(region_id, realm_id, user_id)
    .await?;

let is_online = !sessions.is_empty();
```

查询在线统计：

```rust
let snapshot = stats.stats(region_id, realm_id).await?;

println!("players={}", snapshot.user_count);
println!("sessions={}", snapshot.session_count);
```

`OnlineDirectory` 的查询方法和 `OnlineStatsReader::stats` 都不得返回过期 Lease。

## 重复登录策略

Gateway 支持：

- `AllowMultiple`：保留全部已认证 Session；
- `RejectNew`：其他 Session 占用单点登录槽位时拒绝新登录；
- `KickExisting`：新 Session 获得槽位，并断开旧 Session。

分布式 `KickExisting` 必须同时配置共享 `OnlineDirectory` 与
`SessionControlTransport`。在线目录负责定位 Session，会话控制负责通知对应
Gateway 关闭连接。

## 登录排队与 Realm 容量

上层应用负责排队顺序、优先级、排队 Token、位置与预计时间，以及轮询或通知。
排队中的客户端不应长期占用匿名 Gateway 连接；只有队列允许发起认证时，才签发
短有效期登录票据。

Gateway 通过 `GatewayOnlineConfig` 和原子的 `OnlineDirectory::acquire` 执行最终
硬上限。在线统计可用于展示和排队规划，但不能用作先查询、再注册的准入判断。

所选 Realm 已满时，认证返回可重试的 `REALM_FULL` 错误并携带
`retry_after_ms`。登录票据不会被消费，因此客户端可以在应用队列再次放行或指定
延迟结束后，使用同一票据重试。

## Session 生命周期通知

注册 `SessionObserver` 接收 `Connected`、`Authenticated` 和 `Closed`：

```rust
let observer = Arc::new(move |event: SessionEvent| {
    event_tx
        .try_send(event)
        .map_err(|_| Error::QueueFull)?;
    Ok(())
});

let gateway = gateway.session_observer(observer);
```

Observer 是同步回调，必须快速返回。应在这里把不可变事件放入队列，由异步 Worker
执行数据库、Broker 或 HTTP 操作。

`Closed` 快照会保留已认证身份。一个 Session 关闭不代表玩家已经离线，应查询
剩余 Session：

```rust
let Some(identity) = event.session.identity else {
    return Ok(());
};

let sessions = directory
    .user_sessions(
        identity.region_id,
        identity.realm_id,
        identity.user_id,
    )
    .await?;

if sessions.is_empty() {
    application_presence_store.mark_offline(&identity).await?;
}
```

`SessionObserver` 是进程内、尽力而为的通知。Gateway 被强制终止时无法产生
`Closed`。应以有效在线 Lease 作为事实来源，并通过对账任务让持久业务投影与
Lease 过期结果收敛。

## 分组与 Push 路由

`track_group` 和 `group_sessions` 维护可选 Session 分组。
`OnlineDirectoryTargetResolver` 将在线目录适配为 `PushTargetResolver`，从而按
Session、用户、用户列表或 Topic 定位对应 Gateway。

应用可以把分组用于房间或订阅，但分组命名与授权仍属于应用策略。

## 自定义 Backend

自定义 Backend 可以只实现生命周期、只实现统计，或同时实现两者：

```rust
use async_trait::async_trait;
use elura::prelude::*;

struct PostgresOnlineDirectory {
    pool: PgPool,
}

#[async_trait]
impl OnlineDirectory for PostgresOnlineDirectory {
    // 实现原子的重复登录与容量准入、Lease 生命周期、过期过滤和分组。
}

#[async_trait]
impl OnlineStatsReader for PostgresOnlineDirectory {
    async fn stats(
        &self,
        region_id: u32,
        realm_id: u32,
    ) -> Result<OnlineStats> {
        // 只聚合未过期 Lease。
    }
}
```

两个实现都存在后，`PostgresOnlineDirectory` 会自动实现 `OnlineBackend`。

## 职责边界

Elura 负责传输存活检测、Session 身份、Lease、原子的重复登录与硬容量准入，
以及供应商无关查询。应用负责登录排队策略、持久 `online` 投影、最后在线时间、
好友通知、隐私规则、机器人过滤和状态对账任务。
