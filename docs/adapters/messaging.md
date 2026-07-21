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

### Usage example

Install the same `PushTransport` in the World, then use the request context:

```rust
use elura::world::Event;

struct InventoryChanged;

impl Event for InventoryChanged {
    const ID: u32 = 201;
    type Message = InventoryChangedMessage;
}

let world = World::new(world_config).push_transport(push.clone());

// Inside a typed Handler:
context.push_user(InventoryChanged, &message).await?;
```

`InventoryChangedMessage` is an application Protobuf type. The target resolver
uses the online directory to find the owning Gateway.

## Session control

`SessionControlTransport` delivers kick or revoke events to active Gateways.
`RedisSessionControlBus` and `RedisSessionControlConfig` provide the shared
implementation and are required for cross-Gateway `kick_existing` behavior.

Use unique Gateway identities and monitor reconnect and pending-delivery state.
An online directory alone can find the owner but cannot force the owning process
to close a live connection.

### Usage example

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

Every replica needs a different Gateway ID. `Gateway::run` supervises the Push
and Session-control subscribers.

## Player invalidation

`InvalidationBus` tells World processes to evict or refresh cached player state.
`RedisInvalidationBus` uses Redis Pub/Sub and reconnects subscriptions. Pub/Sub
is transient, so the source of truth must remain reloadable; invalidation is a
cache-coherence hint, not durable event storage.

Use an [Outbox](./outbox) when an event must survive outages and be retried.

### Usage example

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

// Supervise this future with the World process lifecycle.
// synchronizer.run().await?;
```

Call `store_committed` or `delete_committed` only after the corresponding
database transaction commits. Every World uses the same namespace and a unique
source ID.
