---
outline: 2
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

## Health and readiness

`RedisHealth` implements readiness probing and exposes `RedisHealthStats` plus
`SubscriptionStats`. Register it when Redis failure makes new traffic
incorrect or unusable. Temporary dependency failure should usually fail
readiness, not process liveness, to avoid restart amplification.

## Operational checklist

- Set connection, command, blocking-read, and reconnect expectations explicitly.
- Monitor latency, errors, reconnects, stream pending entries, memory, and
  eviction policy.
- Disable unintended key eviction for correctness-critical state.
- Test failover and subscription recovery with the actual topology.
- Back up only data whose adapter semantics require durable recovery.

See the capability pages for the specific Redis implementation and consistency
model; “uses Redis” alone is not enough to describe behavior.

## Example: readiness

```rust
use std::sync::Arc;

use elura::adapters::redis::RedisHealth;
use elura::prelude::*;

let redis_health = Arc::new(RedisHealth::connect(redis_url).await?);
let gateway = Gateway::new(gateway_config)
    .readiness_probe("redis", redis_health.clone());

// Supervise this future with the application lifecycle.
// redis_health.run(check_interval, timeout, shutdown).await?;
```

Registering the probe only adds readiness evaluation. The application must also
supervise `RedisHealth::run` so checks continue during the process lifetime.
