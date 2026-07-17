---
outline: 2
---

# Custom adapters

Elura's runtime depends on object-safe capability contracts. Implement the
contract you need and inject it into Gateway, World, an HTTP service, or a
worker; no registry-wide backend switch is required.

| Capability | Contract |
| --- | --- |
| World discovery/registration | `WorldDiscovery`, `WorldRegistrar` |
| Account generation | `AccountVersionStore`, `MutableAccountVersionStore` |
| Online Session lifecycle | `OnlineDirectory` |
| Online totals | `OnlineStatsReader` |
| Complete online backend | `OnlineBackend` |
| OTP challenge state | `OtpStore` |
| Ticket replay | `ReplayStore` |
| Push | `PushTransport`, `PushTargetResolver` |
| Session control | `SessionControlTransport` |
| Player cache invalidation | `InvalidationBus` |
| Durable delivery | `OutboxStore`, `IdempotencyStore` |
| Gateway admission | `AdmissionController` |

## Implementation rules

- Preserve the contract's atomicity and shutdown semantics, not only its method
  signatures.
- Validate namespaces, identifiers, durations, and untrusted payload sizes.
- Handle transient reconnects internally when the contract owns a long-running
  subscriber.
- State delivery guarantees explicitly and make duplicates safe where needed.
- Expose readiness and useful counters without logging secrets or payloads.
- Test concurrency, cancellation, lease expiry, fencing, and backend failover.

Keep application-specific implementations in the application or a separate
crate. Import them explicitly at composition sites so infrastructure choices
remain reviewable.

## Contribute upstream

When an Adapter supports a generally useful database, broker, service registry,
or deployment platform, contributing it to Elura is preferred over
maintaining parallel application copies.

An Adapter PR should include:

- an opt-in feature and explicit dependency boundary;
- documented atomicity, consistency, delivery, cancellation, and shutdown
  semantics;
- readiness and useful operational counters where dependency failure matters;
- tests for concurrency, lease expiry, fencing, reconnect, duplicate delivery,
  and backend failover as applicable;
- opt-in external integration tests that do not make the default test suite
  depend on a running service;
- public API coverage, Rustdoc, and matching English/Chinese catalog updates.

Cluster or distributed implementations must be tested against their real
topology assumptions, including key placement and failover behavior.

## Example: replay-store skeleton

```rust
use async_trait::async_trait;
use elura::prelude::{ReplayStore, Result};

struct DatabaseReplayStore;

#[async_trait]
impl ReplayStore for DatabaseReplayStore {
    async fn reserve(&self, ticket_id: &str, expires_at: u64) -> Result<bool> {
        // One atomic insert-if-absent operation must decide the winner.
        application_database_reserve(ticket_id, expires_at).await
    }
}
```

The database operation must return `true` to exactly one concurrent caller and
must return an error—not `true`—when the backend is unavailable.
