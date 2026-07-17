---
outline: [2, 3]
---

# Messaging and control adapters

These contracts move control events across process boundaries. They are not the
Gateway-to-World request transport; game requests use ELR2 directly.

## Push

`PushTransport` publishes `PushRequest` values and runs subscribers.
`PushTargetResolver` independently determines the Gateways that own a target,
allowing an SQL-backed directory to be combined with a broker-backed transport.

`RedisStreamPushBus` uses `RedisStreamPushConfig`, bounded Redis Streams, and
consumer groups. Configure unique consumer IDs, maximum stream length, claim
idle time, blocking timeout, and batch size. Delivery can be at least once, so consumers must tolerate
duplicates using sequence/trace metadata when correctness requires it.

## Session control

`SessionControlTransport` delivers kick or revoke events to active Gateways.
`RedisSessionControlBus` and `RedisSessionControlConfig` provide the shared
implementation and are required for cross-Gateway `kick_existing` behavior.

Use unique Gateway identities and monitor reconnect and pending-delivery state.
An online directory alone can find the owner but cannot force the owning process
to close a live connection.

## Player invalidation

`InvalidationBus` tells World processes to evict or refresh cached player state.
`RedisInvalidationBus` uses Redis Pub/Sub and reconnects subscriptions. Pub/Sub
is transient, so the source of truth must remain reloadable; invalidation is a
cache-coherence hint, not durable event storage.

Use an [Outbox](./outbox) when an event must survive outages and be retried.

## Example: cross-Gateway push and control

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

Install the same `online`, `push`, and `control` bundle into that Gateway. Every
replica needs a different Gateway ID.
