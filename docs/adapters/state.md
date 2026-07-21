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

### Usage example

```rust
use std::sync::Arc;

use elura::adapters::account_version::RedisAccountVersionStore;
use elura::prelude::*;

let versions = Arc::new(
    RedisAccountVersionStore::connect(redis_url, "game:account-version").await?,
);
let gateway = Gateway::new(gateway_config)
    .account_version_store(versions, AccountVersionSettings::default());
```

Use `SqlAccountVersionStore::connect_postgres` or `connect_mysql` when account
state already lives in SQL. Call `ensure_schema` once under migration ownership.

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

### Usage example

```rust
use std::{sync::Arc, time::Duration};

use elura::adapters::online::RedisOnlineDirectory;
use elura::prelude::*;

let directory = Arc::new(RedisOnlineDirectory::connect(
    redis_url,
    "game:online",
    Duration::from_secs(60),
).await?);

let online_config = GatewayOnlineConfig::new(
    "gateway-1",
    Duration::from_secs(60),
    Duration::from_secs(20),
    DuplicateLoginMode::AllowMultiple,
);

let gateway = Gateway::new(gateway_config)
    .online_directory(directory, online_config);
```

See [Online presence](./online) for Session lookup, totals, groups, lifecycle
observers, and `KickExisting` configuration.

## OTP storage

`OtpStore` atomically creates challenges and verifies/consumes attempts.
`MemoryOtpStore` is process-local; `RedisOtpStore` is required when multiple API
replicas issue or verify the same challenge namespace.

Storage protects atomicity and cooldown. API-level IP, recipient, and global
rate limits remain an application responsibility. See the [OTP provider](/providers/otp).

### Usage example

```rust
use std::time::Duration;

use elura::adapters::otp::RedisOtpStore;
use elura::core::otp::{OtpCreateResult, OtpRecord, OtpStore};

let store = RedisOtpStore::connect(redis_url, "game:otp").await?;
let result = store
    .create(
        OtpRecord {
            subject_key: "email:user@example.com".into(),
            purpose: "login".into(),
            code_digest: digest.to_vec(),
        },
        Duration::from_secs(300),
        Duration::from_secs(60),
    )
    .await?;
assert!(matches!(result, OtpCreateResult::Stored | OtpCreateResult::Cooldown));
```

Store a cryptographic digest, never the plaintext OTP. Pass the same store to
the application Provider that issues and verifies challenges.

## Ticket replay

`ReplayStore` prevents a one-time Gateway ticket from being accepted twice.
`MemoryReplayStore` is correct only when all verification for a ticket namespace
hits one process. `RedisReplayStore` shares replay state across Gateway replicas.

Do not horizontally scale ticket verification with independent memory stores;
the same ticket can otherwise be accepted by multiple replicas.

### Usage example

```rust
use std::sync::Arc;

use elura::adapters::replay::RedisReplayStore;
use elura::prelude::*;

let replay = Arc::new(
    RedisReplayStore::connect(redis_url, "game:ticket-replay").await?,
);
let gateway = Gateway::new(gateway_config).replay_store(replay);
```

For a single Gateway process, `MemoryReplayStore` is the zero-dependency
alternative. Switch to Redis before multiple Gateways can accept the same
ticket namespace.
