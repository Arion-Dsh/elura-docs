---
outline: [2, 4]
---

# Outbox adapters

`OutboxStore` provides durable event append, leasing, acknowledgement, retry,
dead-letter, and replay operations. The runtime `OutboxDispatcher` executes
handlers; Gateway and World launchers intentionally do not start it for you.

## Implementations

### Memory

`MemoryOutbox` is useful for tests and one-process workflows. It does not survive
replacement and cannot participate in an application database transaction.

#### Usage example

```rust
use elura::core::outbox::{MemoryOutbox, OutboxEvent, OutboxStore};

let outbox = MemoryOutbox::new();
let event = OutboxEvent::new("player.created", payload)?;
outbox.append(event).await?;
```

Use this only when losing queued events on process replacement is acceptable.

### Redis

`RedisOutbox` provides shared leasing and retry state. Use it when Redis is the
chosen durability boundary and application writes do not need an atomic SQL
transaction with the outbox append.

`RedisIdempotencyStore` supplies dispatcher handler idempotency. Keep its TTL
long enough for the maximum event retry/replay window.

#### Usage example

```rust
use elura::adapters::outbox::RedisOutbox;
use elura::core::outbox::{OutboxEvent, OutboxStore};

let outbox = RedisOutbox::connect(redis_url, "game:outbox").await?;
let event = OutboxEvent::new("player.entitlement-granted", payload)?;
outbox.append(event).await?;
```

Run an `OutboxDispatcher` worker against the same store; appending alone does
not execute handlers.

### PostgreSQL and MySQL

`SqlOutbox` supports both databases, exposes `ensure_schema`, and provides
`append_postgres_tx` / `append_mysql_tx` so a business mutation and event can
commit atomically in the caller's transaction.

This is the preferred pattern when the business record already lives in the
same SQL database.

#### Usage example

```rust
use elura::adapters::outbox::SqlOutbox;
use elura::core::outbox::{OutboxEvent, OutboxStore};

let outbox = SqlOutbox::connect_postgres(postgres_url).await?;
outbox.ensure_schema().await?;

let event = OutboxEvent::new("player.entitlement-granted", payload)?;
outbox.append(event).await?;
```

For atomic business updates, use the caller's `sqlx` transaction:

```rust
use elura::adapters::outbox::SqlOutbox;
use elura::core::outbox::OutboxEvent;

let pool = sqlx::PgPool::connect(postgres_url).await?;
let outbox = SqlOutbox::postgres(pool.clone());
outbox.ensure_schema().await?;

let mut tx = pool.begin().await?;
sqlx::query("UPDATE players SET coins = coins + $1 WHERE id = $2")
    .bind(100_i64)
    .bind(player_id)
    .execute(&mut *tx)
    .await?;
let event = OutboxEvent::new("player.coins-changed", payload)?;
SqlOutbox::append_postgres_tx(&mut tx, &event).await?;
tx.commit().await?;
```

Manage `ensure_schema` as a migration step instead of running it concurrently
from every application replica.

## Administration

With the `admin` feature, `OutboxAdmin` exposes relative Axum routes for listing
and replaying dead letters; `OutboxAdminConfig` bounds list and request sizes.
Mount its router under an authenticated internal namespace; it does not add
authentication by itself.

## Operating the dispatcher

- Give each worker a stable unique identity.
- Set lease duration above normal handler latency and renew long work.
- Make handlers idempotent and classify retryable failures.
- Alert on dead letters, repeated lease loss, lag, and oldest available event.
- Shut the dispatcher down with the application lifecycle.
