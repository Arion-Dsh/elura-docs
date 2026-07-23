---
outline: 2
---

# Manual single-process setup

`Monolith` runs Gateway and World in one process with direct in-memory
dispatch. It keeps typed handlers and the public client protocol, but removes
the internal token, World listener, and service discovery.

Use this topology for early development, small deployments, and tests where
independent Gateway/World scaling is unnecessary.

## 1. Create the package

```bash
mkdir -p my-game/src/bin my-game/config
cd my-game
```

```toml [Cargo.toml]
[package]
name = "my-game"
version = "0.1.0"
edition = "2024"
rust-version = "1.97"
publish = false

[dependencies]
prost = "0.14"
elura = { version = "0.2.7", features = ["monolith"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal"] }
```

## 2. Write the application

The composition root loads separate Gateway, World, transport, and admin
configuration, then registers World handlers before starting the combined
runtime:

```rust [src/bin/monolith.rs]
use std::{env, fs};

use elura::prelude::*;
use prost::Message;
use serde::Deserialize;

#[derive(Clone, PartialEq, Message)]
struct HelloRequest {
    #[prost(string, tag = "1")]
    name: String,
}

#[derive(Clone, PartialEq, Message)]
struct HelloResponse {
    #[prost(string, tag = "1")]
    message: String,
}

struct Hello;

impl Route for Hello {
    const ID: u32 = 100;
    const NAME: &'static str = "example.hello";

    type Request = HelloRequest;
    type Response = HelloResponse;
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    gateway: GatewayConfig,
    world: WorldConfig,
    admin: AdminServerConfig,
    tcp: TcpConfig,
}

impl AppConfig {
    fn load() -> elura::Result<Self> {
        let path = env::var("APP_MONOLITH_CONFIG")
            .unwrap_or_else(|_| "config/monolith.json".into());
        let mut config: Self = serde_json::from_slice(&fs::read(path)?)?;
        config.gateway.ticket.key = required_env("APP_TICKET_KEY")?;
        config.admin.token = optional_env("APP_ADMIN_TOKEN");
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    let tcp = TcpTransport::new(app.tcp)?;
    Monolith::new(app.gateway, app.world)
        .transport(tcp)
        .route(Hello, |_context, request| async move {
            Ok(HelloResponse {
                message: format!("Hello, {}!", request.name),
            })
        })
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

## 3. Configure and run

```json [config/monolith.json]
{
  "gateway": {
    "ticket": {
      "issuer": "game-login",
      "audience": "game-gateway",
      "login_ttl": { "secs": 60, "nanos": 0 },
      "reconnect_ttl": { "secs": 1800, "nanos": 0 }
    }
  },
  "world": {
    "handler_timeout": { "secs": 5, "nanos": 0 }
  },
  "admin": {
    "listen": "127.0.0.1:17001",
    "component": "monolith",
    "instance_id": "monolith-local"
  },
  "tcp": {
    "listen": "127.0.0.1:17000"
  }
}
```

Generate a ticket key and start the process:

```bash
export APP_TICKET_KEY="$(openssl rand -hex 32)"
cargo run --bin monolith
```

Verify it from another terminal:

```bash
curl -i http://127.0.0.1:17001/elura/healthz
curl -i http://127.0.0.1:17001/elura/readyz
```

Both endpoints return `204 No Content`. There is no World network port because
commands are dispatched in process.

## Move beyond one process

The handler code can stay unchanged when moving to a split topology. Replace
the composition root with separate `Gateway` and `World` processes, add an
internal token, and select discovery explicitly.

- [Manual split setup](./manual-setup)
- [Manual distributed setup](./manual-distributed)
