---
outline: 2
---

# Adapters

Adapters connect Elura's capability contracts to infrastructure. They are
grouped by application capability, not by vendor: one application may use DNS
for discovery, Redis for online sessions, and SQL for durable outbox state.

```text
Gateway / World / worker
          |
     core contract
          |
 infrastructure adapter
```

Redis, SQL, and Kubernetes are implementations, not framework requirements.
Gateway-to-World application traffic still travels directly over ELR2.

## Capability catalog

| Area | Core contract | Built-in implementations |
| --- | --- | --- |
| [Discovery](./discovery) | `WorldDiscovery`, `WorldRegistrar` | DNS, Redis, Kubernetes Endpoints |
| [Shared state](./state) | account version, online, OTP, replay contracts | Memory, Redis, SQL by capability |
| [Online presence](./online) | `OnlineDirectory`, `OnlineStatsReader`, `OnlineBackend` | Memory, Redis, custom |
| [Messaging and control](./messaging) | `PushTransport`, `SessionControlTransport`, `InvalidationBus` | In-process where applicable, Redis Streams/PubSub |
| [Admission](./admission) | `AdmissionController` | Realm policy, Redis distributed policy |
| [Outbox](./outbox) | `OutboxStore`, `IdempotencyStore` | Memory, Redis, PostgreSQL, MySQL |
| [Kubernetes](./kubernetes) | discovery, leadership, ownership | EndpointSlice and Lease controllers |
| [Redis operations](./redis) | readiness and adapter connection behavior | Standalone and Cluster-aware adapters |
| [Custom](./custom) | public extension traits | Application implementations |

::: tip Contribute reusable infrastructure support
If an Adapter has generally useful semantics for a database, broker, registry,
or platform, submit it upstream so the contract, failure behavior, tests, and
operations guidance can be maintained together. See
[Custom adapters](./custom#contribute-upstream).
:::

## Feature boundaries

```toml
# Contract modules and DNS discovery
elura = { version = "0.3.1", features = ["adapters"] }

# Add only concrete infrastructure in use
elura = { version = "0.3.1", features = ["redis", "sql", "kubernetes"] }
```

Concrete adapter types live under `elura::adapters` and intentionally stay out
of the prelude. This makes Redis, SQL, or Kubernetes dependencies visible in
composition code.

## Minimal composition

The following Gateway deliberately mixes two Redis-backed capabilities. Each
slot is injected independently and can be replaced without changing the other:

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

This only assembles the capabilities. Add a client transport, World client or
discovery, and call `run` as shown in the setup guides.

## Selection rule

Start with in-memory state and the platform's native discovery. Add shared
infrastructure only when a behavior must span replicas or survive process
replacement. Select each capability separately; there is no requirement to use
the same backend everywhere.
