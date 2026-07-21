---
outline: [2, 3]
---

# 消息与控制 Adapter

这些契约在进程间传递控制事件，不是 Gateway 到 World 的请求传输；游戏请求仍然
使用 ELR2 直连。

## Push

`PushTransport` 发布 `PushRequest` 并运行 Subscriber；`PushTargetResolver` 独立
决定目标由哪些 Gateway 持有，因此可以组合 SQL 在线目录与 Broker Push。

`RedisStreamPushBus` 使用 `RedisStreamPushConfig`、有界 Redis Streams 与 Consumer Group。应设置唯一
Consumer ID、Stream 最大长度、Claim Idle、阻塞超时和 Batch Size。投递可能是
At-least-once，需要时用 Sequence/Trace 信息处理重复。

### 使用示例

在 World 中安装同一 `PushTransport`，然后使用请求 Context：

```rust
use elura::world::Event;

struct InventoryChanged;

impl Event for InventoryChanged {
    const ID: u32 = 201;
    type Message = InventoryChangedMessage;
}

let world = World::new(world_config).push_transport(push.clone());

// 在类型化 Handler 中：
context.push_user(InventoryChanged, &message).await?;
```

`InventoryChangedMessage` 是应用 Protobuf 类型。Target Resolver 使用在线目录
定位持有该用户连接的 Gateway。

## 会话控制

`SessionControlTransport` 将 Kick/Revoke 事件发送到活跃 Gateway。
`RedisSessionControlBus` 与 `RedisSessionControlConfig` 提供共享实现，也是跨
Gateway `kick_existing` 所需组件。

在线目录只能找到 Owner，不能单独强制持有连接的进程关闭实时连接。

### 使用示例

```rust
use std::{sync::Arc, time::Duration};

use elura::adapters::online::RedisOnlineDirectory;
use elura::adapters::push::{RedisStreamPushBus, RedisStreamPushConfig};
use elura::adapters::session_control::{
    RedisSessionControlBus, RedisSessionControlConfig,
};

let online = Arc::new(
    RedisOnlineDirectory::connect(redis_url, "game:online", Duration::from_secs(60)).await?,
);
let push = Arc::new(RedisStreamPushBus::new(
    online.clone(),
    "gateway-1",
    RedisStreamPushConfig::default(),
)?);
let control = Arc::new(RedisSessionControlBus::connect(
    redis_url,
    "gateway-1",
    RedisSessionControlConfig::default(),
).await?);

let online_config = GatewayOnlineConfig::new(
    "gateway-1",
    Duration::from_secs(60),
    Duration::from_secs(20),
    DuplicateLoginMode::KickExisting,
);

let gateway = Gateway::new(gateway_config)
    .online_directory(online, online_config)
    .push_transport(push)
    .session_control_transport(control);
```

每个副本必须使用不同的 Gateway ID。`Gateway::run` 会监督 Push 与 Session-control
Subscriber。

## Player 缓存失效

`InvalidationBus` 通知 World 淘汰或刷新 Player Cache；`RedisInvalidationBus` 使用
Redis Pub/Sub 并恢复断开的订阅。Pub/Sub 是瞬时的，Source of Truth 必须可重新
加载；Invalidation 只是缓存一致性提示，不是持久事件存储。

必须跨故障保存并重试的事件应使用 [Outbox](./outbox)。

### 使用示例

```rust
use std::sync::Arc;

use elura::adapters::invalidation::RedisInvalidationBus;
use elura::world::player::{
    PlayerCache, PlayerCacheConfig, PlayerCacheSynchronizer,
};

let bus = Arc::new(
    RedisInvalidationBus::connect(redis_url, "game:player-invalidation").await?,
);
let cache = Arc::new(PlayerCache::<PlayerState>::new(
    PlayerCacheConfig::default(),
)?);
let synchronizer = Arc::new(PlayerCacheSynchronizer::new(
    cache,
    bus,
    "players-v1",
    "world-1",
)?);

// 由 World 进程生命周期监督这个 Future。
// synchronizer.run().await?;
```

只能在对应数据库事务提交后调用 `store_committed` 或 `delete_committed`。
所有 World 使用相同 Namespace，但每个 World 必须使用唯一 Source ID。
