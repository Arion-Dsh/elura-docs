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

## 会话控制

`SessionControlTransport` 将 Kick/Revoke 事件发送到活跃 Gateway。
`RedisSessionControlBus` 与 `RedisSessionControlConfig` 提供共享实现，也是跨
Gateway `kick_existing` 所需组件。

在线目录只能找到 Owner，不能单独强制持有连接的进程关闭实时连接。

## Player 缓存失效

`InvalidationBus` 通知 World 淘汰或刷新 Player Cache；`RedisInvalidationBus` 使用
Redis Pub/Sub 并恢复断开的订阅。Pub/Sub 是瞬时的，Source of Truth 必须可重新
加载；Invalidation 只是缓存一致性提示，不是持久事件存储。

必须跨故障保存并重试的事件应使用 [Outbox](./outbox)。

## 示例：跨 Gateway Push 与控制

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
```

应把同一组 `online`、`push` 与 `control` 安装到该 Gateway，并为每个副本设置不同
Gateway ID。
