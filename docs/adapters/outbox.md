---
outline: [2, 3]
---

# Outbox adapters

`OutboxStore` provides durable event append, leasing, acknowledgement, retry,
dead-letter, and replay operations. The runtime `OutboxDispatcher` executes
handlers; Gateway and World launchers intentionally do not start it for you.

## Implementations

### Memory

`MemoryOutbox` is useful for tests and one-process workflows. It does not survive
replacement and cannot participate in an application database transaction.

### Redis

`RedisOutbox` provides shared leasing and retry state. Use it when Redis is the
chosen durability boundary and application writes do not need an atomic SQL
transaction with the outbox append.

`RedisIdempotencyStore` supplies dispatcher handler idempotency. Keep its TTL
long enough for the maximum event retry/replay window.

### PostgreSQL and MySQL

`SqlOutbox` supports both databases, exposes `ensure_schema`, and provides
`append_postgres_tx` / `append_mysql_tx` so a business mutation and event can
commit atomically in the caller's transaction.

This is the preferred pattern when the business record already lives in the
same SQL database.

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

## Example: SQL outbox

```rust
use elura::adapters::outbox::SqlOutbox;
use elura::core::outbox::{OutboxEvent, OutboxStore};

let outbox = SqlOutbox::connect_postgres(postgres_url).await?;
outbox.ensure_schema().await?;

let event = OutboxEvent::new("player.entitlement-granted", payload)?;
outbox.append(event).await?;
```

For atomic business updates, call `SqlOutbox::append_postgres_tx` with the same
`sqlx` transaction instead of calling `append` after the transaction commits.
