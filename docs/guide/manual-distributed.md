---
outline: 2
---

# Manual distributed setup

This guide upgrades the [manual split application](./manual-setup) to a
horizontally scalable topology. Gateway-to-World application traffic travels
directly over ELR2; Redis is not a proxy or broker on that data path. This guide
uses the provided Redis adapters for World registration/discovery, shared ticket
replay protection, online leases, cross-Gateway Push, and session control.

```text
application data:
clients ──> Gateways ── ELR2 ──> Worlds

shared state and control:
Gateways <──> pluggable infrastructure <──> Worlds
                (Redis in this guide)
```

The infrastructure roles are separate core traits rather than one fixed
middleware dependency. An application can mix the available memory, DNS,
Kubernetes, SQL, and Redis adapters, or supply its own implementations. Redis is
the concrete choice for this tutorial because the repository provides a complete
set of Redis-backed adapters for the topology below.

## 1. Enable Redis

Keep the dependencies from the split tutorial and change the Elura feature.
The facade enables the Redis client used internally by the adapters, so the
application does not need a direct `redis` dependency for this example:

```toml [Cargo.toml]
elura = { version = "0.2.8", features = ["redis"] }
```

## 2. Register each World

Keep the `Hello` route, its request and response messages, and helper functions
from the split tutorial. Replace the World configuration and `main` with the
following code:

```rust [src/bin/world.rs]
use std::{env, fs, sync::Arc};

use elura::adapters::discovery::{RedisWorldRegistrar, RedisWorldRegistrationConfig};
use elura::prelude::*;
use prost::Message;
use serde::Deserialize;

// Keep Hello, HelloRequest, and HelloResponse from the split tutorial.

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: WorldConfig,
    admin: AdminServerConfig,
    registration: RedisWorldRegistrationConfig,
    #[serde(skip)]
    instance_id: String,
    #[serde(skip)]
    redis_url: String,
}

impl AppConfig {
    fn load() -> elura::Result<Self> {
        let path = env::var("APP_WORLD_CONFIG")
            .unwrap_or_else(|_| "config/distributed-world.json".into());
        let mut config: Self = serde_json::from_slice(&fs::read(path)?)?;
        config.runtime.internal_token = Some(required_env("APP_INTERNAL_TOKEN")?);
        config.admin.token = optional_env("APP_ADMIN_TOKEN");
        config.redis_url = required_env("APP_REDIS_URL")?;
        config.instance_id = required_env("APP_INSTANCE_ID")?;
        config.admin.instance_id = config.instance_id.clone();
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    let registrar = Arc::new(
        RedisWorldRegistrar::connect(&app.redis_url, &app.instance_id, app.registration).await?,
    );
    World::new(app.runtime)
        .registrar(registrar)
        .route(Hello, |_context, request| async move {
            Ok(HelloResponse {
                message: format!("Hello, {}!", request.name),
            })
        })
        .run(app.admin)
        .await
}

// Keep required_env and optional_env from the split tutorial.
```

Each replica must have a unique `APP_INSTANCE_ID` and advertise an address
reachable from every Gateway.

## 3. Assemble distributed Gateway state

Replace the Gateway source with the following composition. Concrete Redis
types remain outside the prelude so the distributed dependencies are visible:

```rust [src/bin/gateway.rs]
use std::{env, fs, sync::Arc, time::Duration};

use elura::adapters::discovery::{RedisWorldDiscovery, RedisWorldDiscoveryConfig};
use elura::adapters::online::RedisOnlineDirectory;
use elura::adapters::push::{RedisStreamPushBus, RedisStreamPushConfig};
use elura::adapters::replay::RedisReplayStore;
use elura::adapters::session_control::{
    RedisSessionControlBus, RedisSessionControlConfig,
};
use elura::prelude::*;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DistributedConfig {
    key_prefix: String,
    lease_ttl: Duration,
    renew_interval: Duration,
    push: RedisStreamPushConfig,
    session_control: RedisSessionControlConfig,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: GatewayConfig,
    admin: AdminServerConfig,
    tcp: TcpConfig,
    discovery: RedisWorldDiscoveryConfig,
    distributed: DistributedConfig,
    #[serde(skip)]
    redis_url: String,
}

impl AppConfig {
    fn load() -> elura::Result<Self> {
        let path = env::var("APP_GATEWAY_CONFIG")
            .unwrap_or_else(|_| "config/distributed-gateway.json".into());
        let mut config: Self = serde_json::from_slice(&fs::read(path)?)?;
        config.runtime.ticket.key = required_env("APP_TICKET_KEY")?;
        config.runtime.internal_token = Some(required_env("APP_INTERNAL_TOKEN")?);
        config.admin.token = optional_env("APP_ADMIN_TOKEN");
        config.redis_url = required_env("APP_REDIS_URL")?;
        if let Some(id) = optional_env("APP_INSTANCE_ID") {
            config.admin.instance_id = id;
        }
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    let gateway_id = app.admin.instance_id.clone();
    let prefix = app.distributed.key_prefix.clone();

    let discovery = Arc::new(
        RedisWorldDiscovery::connect(&app.redis_url, app.discovery).await?,
    );
    let replay = Arc::new(
        RedisReplayStore::connect(&app.redis_url, format!("{prefix}:replay")).await?,
    );
    let online = Arc::new(
        RedisOnlineDirectory::connect(
            &app.redis_url,
            format!("{prefix}:online"),
            app.distributed.lease_ttl,
        )
        .await?,
    );
    let push = Arc::new(RedisStreamPushBus::new(
        online.clone(),
        &gateway_id,
        app.distributed.push,
    )?);
    let session_control = Arc::new(RedisSessionControlBus::connect(
        &app.redis_url,
        &gateway_id,
        app.distributed.session_control,
    ).await?);
    let tcp = TcpTransport::new(app.tcp)?;
    let online_config = GatewayOnlineConfig::new(
        gateway_id.clone(),
        app.distributed.lease_ttl,
        app.distributed.renew_interval,
        DuplicateLoginMode::KickExisting,
    );

    Gateway::new(app.runtime)
        .transport(tcp)
        .replay_store(replay)
        .online_directory(online.clone(), online_config)
        .push_transport(push)
        .session_control_transport(session_control)
        .readiness_probe("redis-online", online)
        .world_discovery(discovery)
        .run(app.admin)
        .await
}

fn required_env(name: &str) -> elura::Result<String> {
    env::var(name).map_err(|_| elura::Error::InvalidConfig(format!("{name} is required")))
}

fn optional_env(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}
```

`kick_existing` is valid only when the online directory and session-control
transport are installed together. The readiness probe prevents new traffic
when the shared online directory is unavailable.

## 4. Add configuration

```json [config/distributed-world.json]
{
  "runtime": {
    "listen": "127.0.0.1:18000"
  },
  "admin": {
    "listen": "127.0.0.1:18001",
    "component": "world",
    "instance_id": "replaced-from-environment"
  },
  "registration": {
    "key_prefix": "elura:worlds",
    "advertise_address": "127.0.0.1:18000",
    "region_id": 1,
    "realm_id": 1,
    "route": 0,
    "ttl": { "secs": 30, "nanos": 0 },
    "renew_interval": { "secs": 10, "nanos": 0 }
  }
}
```

```json [config/distributed-gateway.json]
{
  "runtime": {
    "ticket": {
      "issuer": "game-login",
      "audience": "game-gateway",
      "login_ttl": { "secs": 60, "nanos": 0 },
      "reconnect_ttl": { "secs": 1800, "nanos": 0 }
    },
    "world_routing": { "pool_size": 2, "max_in_flight_per_connection": 64 }
  },
  "admin": {
    "listen": "127.0.0.1:17001",
    "component": "gateway",
    "instance_id": "gateway-local-1"
  },
  "tcp": { "listen": "127.0.0.1:17000" },
  "discovery": {
    "key_prefix": "elura:worlds",
    "refresh_interval": { "secs": 5, "nanos": 0 }
  },
  "distributed": {
    "key_prefix": "elura",
    "lease_ttl": { "secs": 45, "nanos": 0 },
    "renew_interval": { "secs": 15, "nanos": 0 },
    "push": {},
    "session_control": { "stream": "elura:session:control" }
  }
}
```

## 5. Run the topology

For local development, start Redis and create one shared environment file:

```bash
docker run --name elura-redis --rm -p 6379:6379 redis:7-alpine
```

```dotenv [config/distributed.env]
APP_REDIS_URL=redis://127.0.0.1:6379/
APP_TICKET_KEY=replace-with-a-random-value-at-least-32-bytes
APP_INTERNAL_TOKEN=replace-with-a-different-value-at-least-32-bytes
```

Load that file in each terminal, then assign a unique instance ID:

```bash [World]
set -a; . config/distributed.env; set +a
export APP_INSTANCE_ID=world-local-1
cargo run --bin world
```

```bash [Gateway]
set -a; . config/distributed.env; set +a
export APP_INSTANCE_ID=gateway-local-1
cargo run --bin gateway
```

The Gateway becomes ready after it discovers the registered World. Add replicas
only after giving every process a unique instance ID, listener, admin listener,
and advertised World address.

## Production invariants

- All Gateways use the same ticket key, internal token, Redis deployment, and
  compatible prefixes.
- Every Gateway has a unique ID; every World registration has a unique ID.
- `0 < renew_interval < lease_ttl` for online sessions.
- World registration TTL is at least twice its renewal interval.
- Redis Cluster deployments must use the cluster-specific constructors and
  compatible hash-tag rules.
- Keep World and Redis private; expose only the Gateway client listener.

See [Distributed infrastructure](/guides/distributed) for adapter choices and
[Production checklist](/reference/production-checklist) before deployment.
