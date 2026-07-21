---
outline: [2, 3]
---

# Redis adapter operations

Redis backs several independent adapters; it is not a mandatory central bus.
Each adapter owns its schema and key prefix, and applications may combine Redis
with DNS, SQL, Kubernetes, memory, or custom implementations.

## Connections and Cluster

Concrete types expose standalone constructors and, where supported,
Cluster-specific constructors. Use the constructor that matches the deployment;
do not assume a Cluster URL behaves like a single Redis node.

Keys participating in one atomic script must share a compatible Redis Cluster
hash tag. Allocate explicit environment/application prefixes and prevent two
incompatible deployments from sharing them.

### Usage example

Use Cluster-specific constructors for adapters that support multi-key atomic
operations:

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

Keep keys used by one Lua script or transaction in the same hash slot. The
adapter normalizes prefixes where supported, but application-supplied stream
names still need a compatible hash tag.

## Health and readiness

`RedisHealth` implements readiness probing and exposes `RedisHealthStats` plus
`SubscriptionStats`. Register it when Redis failure makes new traffic
incorrect or unusable. Temporary dependency failure should usually fail
readiness, not process liveness, to avoid restart amplification.

### Usage example

```rust
use std::sync::Arc;

use elura::adapters::redis::RedisHealth;
use elura::prelude::*;

let redis_health = Arc::new(RedisHealth::connect(redis_url).await?);
let gateway = Gateway::new(gateway_config)
    .readiness_probe("redis", redis_health.clone());

// Supervise this future with the application lifecycle.
// redis_health.run(shutdown, check_interval, timeout).await?;
```

Registering the probe only adds readiness evaluation. The application must also
supervise `RedisHealth::run` so checks continue during the process lifetime.

## Operational checklist

- Set connection, command, blocking-read, and reconnect expectations explicitly.
- Monitor latency, errors, reconnects, stream pending entries, memory, and
  eviction policy.
- Disable unintended key eviction for correctness-critical state.
- Test failover and subscription recovery with the actual topology.
- Back up only data whose adapter semantics require durable recovery.

See the capability pages for the specific Redis implementation and consistency
model; “uses Redis” alone is not enough to describe behavior.
