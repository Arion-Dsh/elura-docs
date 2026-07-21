---
outline: [2, 3]
---

# Admission adapters

Admission runs before a client becomes an active session. The
`AdmissionController` contract can reject by stage and return retry or policy
metadata without coupling the transport to a storage vendor.

## Built-in policies

`RealmAdmission` is the Gateway's local Region/Realm allowlist; it rejects an
authenticated identity routed to a Realm that the Gateway does not serve. It
does not count Sessions. Configure final authenticated-Session capacity through
`GatewayOnlineConfig::with_realm_capacity` and a shared `OnlineDirectory`.
`RedisAdmissionController` adds shared IP/user limits, bans, and maintenance
state through `RedisAdmissionConfig` and `AdmissionLimit`. It also implements
`AdmissionAdmin` for controlled administrative changes.

Enable `redis`, choose explicit key prefixes, and decide fail-open/fail-closed
behavior at the application boundary. A Redis outage must not accidentally
bypass a security policy unless that degradation is intentional.

Admission limits complement—not replace—edge rate limiting, connection limits,
authentication replay protection, and application authorization.

Login queue order, priority, position, and ETA remain upper-application policy.
See [Online presence](./online#login-queue-and-realm-capacity) for the atomic
hard-capacity boundary.

### Install Redis admission

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

### Change shared policy

```rust
use std::{net::IpAddr, time::Duration};

let address: IpAddr = "203.0.113.10".parse()?;
admission
    .ban_ip(address, Duration::from_secs(3600), "abusive traffic")
    .await?;

admission
    .set_maintenance(Duration::from_secs(600), "scheduled rollout")
    .await?;

// Later:
admission.unban_ip(address).await?;
admission.clear_maintenance().await?;
```

Invoke these methods only from authenticated operator workflows. Limits, bans,
and maintenance state share the prefix configured on the controller.
