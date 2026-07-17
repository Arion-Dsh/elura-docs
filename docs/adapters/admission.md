---
outline: 2
---

# Admission adapters

Admission runs before a client becomes an active session. The
`AdmissionController` contract can reject by stage and return retry or policy
metadata without coupling the transport to a storage vendor.

## Built-in policies

`RealmAdmission` is the Gateway's local realm-capacity policy.
`RedisAdmissionController` adds shared IP/user limits, bans, and maintenance
state through `RedisAdmissionConfig` and `AdmissionLimit`. It also implements
`AdmissionAdmin` for controlled administrative changes.

Enable `redis`, choose explicit key prefixes, and decide fail-open/fail-closed
behavior at the application boundary. A Redis outage must not accidentally
bypass a security policy unless that degradation is intentional.

Admission limits complement—not replace—edge rate limiting, connection limits,
authentication replay protection, and application authorization.

## Example: install Redis admission

```rust
use std::sync::Arc;

use elura::adapters::admission::{RedisAdmissionConfig, RedisAdmissionController};
use elura::prelude::*;

let mut config = RedisAdmissionConfig::default();
config.prefix = "game:admission".into();

let admission = Arc::new(RedisAdmissionController::connect(redis_url, config).await?);
let gateway = Gateway::new(gateway_config)
    .admission(admission.clone(), AdmissionSettings::default())
    .admission_admin(admission);
```

Registering `AdmissionAdmin` makes the same controller available to protected
administrative routes; it does not expose a public endpoint automatically.
