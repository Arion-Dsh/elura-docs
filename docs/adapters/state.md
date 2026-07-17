---
outline: [2, 3]
---

# Shared-state adapters

These adapters implement independent consistency domains. Choose a backend per
contract rather than treating “distributed state” as one database.

## Account version

`AccountVersionStore` supplies a generation used to invalidate old sessions;
`MutableAccountVersionStore` changes it. Built-ins are:

- `MemoryAccountVersionStore` for one process;
- `RedisAccountVersionStore` with the `redis` feature;
- `SqlAccountVersionStore` for PostgreSQL or MySQL with `sql`.

The SQL adapter exposes `ensure_schema`; run migrations under controlled startup
or deployment ownership rather than concurrently from every replica.

## Online directory

`OnlineDirectory` manages Session leases, lookup, groups, and duplicate-login
fencing. `OnlineStatsReader` returns per-region/per-realm Session and
distinct-user totals. `OnlineBackend` combines both capabilities and is
implemented automatically when a type provides both narrower traits.

Lease TTL must tolerate short pauses without keeping dead sessions online for
too long. `KickExisting` also requires a compatible
[session-control transport](./messaging).

See the [online presence API](./online) for complete contracts, Gateway
installation, online counts, lifecycle observers, and custom backend guidance.

## OTP storage

`OtpStore` atomically creates challenges and verifies/consumes attempts.
`MemoryOtpStore` is process-local; `RedisOtpStore` is required when multiple API
replicas issue or verify the same challenge namespace.

Storage protects atomicity and cooldown. API-level IP, recipient, and global
rate limits remain an application responsibility. See the [OTP provider](/providers/otp).

## Ticket replay

`ReplayStore` prevents a one-time Gateway ticket from being accepted twice.
`MemoryReplayStore` is correct only when all verification for a ticket namespace
hits one process. `RedisReplayStore` shares replay state across Gateway replicas.

Do not horizontally scale ticket verification with independent memory stores;
the same ticket can otherwise be accepted by multiple replicas.

## Example: construct shared stores

```rust
use std::time::Duration;

use elura::adapters::account_version::SqlAccountVersionStore;
use elura::adapters::online::RedisOnlineDirectory;
use elura::adapters::replay::RedisReplayStore;

let replay = RedisReplayStore::connect(redis_url, "game:ticket-replay").await?;
let online = RedisOnlineDirectory::connect(
    redis_url,
    "game:online",
    Duration::from_secs(60),
).await?;

let account_versions = SqlAccountVersionStore::connect_postgres(postgres_url).await?;
account_versions.ensure_schema().await?;
```

Constructing stores does not activate them. Inject `replay` and `online` into a
Gateway; inject `account_versions` where the account-version policy is applied.
