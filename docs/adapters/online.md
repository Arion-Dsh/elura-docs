---
outline: [2, 3]
---

# Online presence API

Elura models presence as expiring authenticated-session leases. Gateway owns
lease lifecycle; infrastructure adapters store and query leases; applications
consume the public contracts for player-facing status, counts, and projections.

## Capability model

The API is split by responsibility:

| Contract | Responsibility |
| --- | --- |
| `OnlineDirectory` | Atomically admit, renew, remove, locate, and group live Session leases |
| `OnlineStatsReader` | Read per-region/per-realm Session and distinct-user totals |
| `OnlineBackend` | Convenience combination of both contracts |
| `SessionObserver` | Receive process-local Session lifecycle transitions |

`OnlineBackend` has a blanket implementation. Any type that implements both
`OnlineDirectory` and `OnlineStatsReader` automatically implements
`OnlineBackend`. APIs that need only one capability should accept the narrower
trait.

## Data types

`SessionLease` identifies one authenticated Session:

```rust
pub struct SessionLease {
    pub session_id: Uuid,
    pub gateway_id: String,
    pub identity: Identity,
    pub expires_at: SystemTime,
}
```

`OnlineStats` is a point-in-time aggregate for one region and realm:

```rust
pub struct OnlineStats {
    pub session_count: u64,
    pub user_count: u64,
}
```

`session_count` counts authenticated Sessions. `user_count` deduplicates those
Sessions by `user_id`. One player connected from two devices therefore counts
as two Sessions and one user.

`OnlineAdmissionPolicy` combines duplicate-login behavior with the optional
hard Session limit for the Session's Region and Realm. `OnlineAdmission`
returns `Accepted`, `Duplicate`, or `RealmFull` from the same atomic operation.

## Built-in backends

`MemoryOnlineDirectory` is a zero-dependency reference backend for tests,
development, and one-process deployments. `RedisOnlineDirectory` is the shared
backend for multiple Gateway replicas and supports standalone Redis and Redis
Cluster.

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

Keep the concrete `Arc<RedisOnlineDirectory>` when readiness or adapter-specific
operations are also needed. The trait objects are useful at application service
boundaries.

## Install into Gateway

Gateway accepts the lifecycle contract:

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

Lease timing must satisfy:

```text
0 < renew_interval < lease_ttl
```

During authentication Gateway atomically applies duplicate-login and realm
capacity policy and registers an accepted lease. It renews the lease
periodically and unregisters it when the connection ends. If a Gateway
disappears without cleanup, the adapter must stop returning the lease after its
TTL.

Applications normally call query methods. Gateway owns `acquire`, `renew`, and
`unregister`.

## Query Sessions and totals

Query every live Session for one player:

```rust
let sessions = directory
    .user_sessions(region_id, realm_id, user_id)
    .await?;

let is_online = !sessions.is_empty();
```

Query aggregate online totals:

```rust
let snapshot = stats.stats(region_id, realm_id).await?;

println!("players={}", snapshot.user_count);
println!("sessions={}", snapshot.session_count);
```

`OnlineDirectory` query methods and `OnlineStatsReader::stats` must exclude
expired leases.

## Duplicate-login policy

Gateway supports:

- `AllowMultiple`: keep every authenticated Session;
- `RejectNew`: reject a login while another Session owns the single-login slot;
- `KickExisting`: claim the slot for the new Session and disconnect the old one.

Distributed `KickExisting` requires both a shared `OnlineDirectory` and a
`SessionControlTransport`. The online directory locates the Session; session
control tells the owning Gateway to close it.

## Login queue and realm capacity

The upper application owns queue ordering, priority, queue tokens, position and
ETA reporting, and polling or notification. A queued client should not hold an
anonymous Gateway connection open; obtain a short-lived login ticket only when
the queue grants an authentication attempt.

Gateway provides the final hard limit through `GatewayOnlineConfig` and atomic
`OnlineDirectory::acquire`. Online statistics are useful for display and queue
planning, but must not be used as a check-then-register admission decision.

When the selected Realm is full, authentication returns the retryable
`REALM_FULL` error with `retry_after_ms`. The login ticket is not consumed, so
the client may retry it after the application queue or the indicated delay
allows another attempt.

## Session lifecycle notifications

Register a `SessionObserver` to receive `Connected`, `Authenticated`, and
`Closed` transitions:

```rust
let observer = Arc::new(move |event: SessionEvent| {
    event_tx
        .try_send(event)
        .map_err(|_| Error::QueueFull)?;
    Ok(())
});

let gateway = gateway.session_observer(observer);
```

Observers are synchronous and must return quickly. Enqueue the immutable event
and perform database, broker, or HTTP work in an asynchronous worker.

A `Closed` snapshot retains the authenticated identity. Do not mark a player
offline merely because one Session closed; query all remaining Sessions:

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

`SessionObserver` notifications are process-local and best effort. Abrupt
Gateway termination cannot emit `Closed`. Treat valid online leases as the
source of truth and reconcile any durable application projection against lease
expiry.

## Groups and Push routing

`track_group` and `group_sessions` maintain optional Session groups.
`OnlineDirectoryTargetResolver` adapts a directory into `PushTargetResolver` so
Session, user, user-list, and topic targets can resolve the owning Gateway.

Application code may use groups for rooms or subscriptions, but group naming
and authorization remain application policy.

## Custom backend

A custom backend can implement lifecycle only, statistics only, or both:

```rust
use async_trait::async_trait;
use elura::prelude::*;

struct PostgresOnlineDirectory {
    pool: PgPool,
}

#[async_trait]
impl OnlineDirectory for PostgresOnlineDirectory {
    // Implement atomic duplicate-login and capacity admission, lease
    // lifecycle, expiry filtering, and grouping.
}

#[async_trait]
impl OnlineStatsReader for PostgresOnlineDirectory {
    async fn stats(
        &self,
        region_id: u32,
        realm_id: u32,
    ) -> Result<OnlineStats> {
        // Aggregate only non-expired leases.
    }
}
```

Once both implementations exist, `PostgresOnlineDirectory` automatically
implements `OnlineBackend`.

## Responsibility boundary

Elura owns transport liveness, Session identity, leases, atomic duplicate-login
and hard-capacity admission, and provider-neutral queries. The application owns
login queue policy, durable `online` projections, last-seen timestamps, friend
notifications, privacy rules, bot filtering, and reconciliation jobs.
