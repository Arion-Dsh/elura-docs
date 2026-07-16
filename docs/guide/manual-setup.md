---
outline: 2
---

# Manual split setup: build Elura without the CLI

The `elura` command is only a scaffold generator. This guide creates the same
minimum split application by hand so you can see every dependency, composition
root, and configuration boundary.

Choose [single-process setup](./manual-monolith) when one process is enough, or
[distributed setup](./manual-distributed) when Gateway and World replicas need
shared state and dynamic registration.

You will create this layout:

```text
my-game/
├── Cargo.toml
├── config/
│   ├── gateway.json
│   └── world.json
└── src/bin/
    ├── gateway.rs
    └── world.rs
```

## 1. Create the package

You need Rust `1.97` or newer. Create an empty application directory and add
this manifest:

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
elura = { version = "0.1.1", features = ["adapters"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal"] }
```

The `adapters` feature exposes DNS discovery. It does not select Redis, SQL,
Kubernetes, or a provider automatically.

## 2. Write the World

The World owns typed game handlers. This example registers one protobuf route
with ID `100`:

```rust [src/bin/world.rs]
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
    runtime: WorldLaunchConfig,
}

impl AppConfig {
    fn load() -> elura::Result<Self> {
        let path = env::var("APP_WORLD_CONFIG")
            .unwrap_or_else(|_| "config/world.json".into());
        let mut config: Self = serde_json::from_slice(&fs::read(path)?)?;
        config.runtime.internal_token = required_env("APP_INTERNAL_TOKEN")?;
        config.runtime.admin.token = optional_env("APP_ADMIN_TOKEN");
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    WorldLauncher::new(app.runtime)?
        .configure(|builder| {
            builder.register(
                Hello,
                |_context, request| async move {
                    Ok(HelloResponse {
                        message: format!("Hello, {}!", request.name),
                    })
                },
            )?;
            Ok(())
        })?
        .run()
        .await
}

fn required_env(name: &str) -> elura::Result<String> {
    env::var(name).map_err(|_| elura::Error::InvalidConfig(format!("{name} is required")))
}

fn optional_env(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}
```

The runtime decodes `HelloRequest`, supplies an authenticated `WorldContext`,
and encodes `HelloResponse`. Application route IDs must be at least `100`.

## 3. Write the Gateway

The Gateway accepts client connections and discovers the World. The concrete
DNS adapter stays visible in the import and application configuration:

```rust [src/bin/gateway.rs]
use std::{env, fs, sync::Arc};

use elura::adapters::discovery::DnsWorldDiscoveryConfig;
use elura::prelude::*;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: GatewayLaunchConfig,
    discovery: DnsWorldDiscoveryConfig,
}

impl AppConfig {
    fn load() -> elura::Result<Self> {
        let path = env::var("APP_GATEWAY_CONFIG")
            .unwrap_or_else(|_| "config/gateway.json".into());
        let mut config: Self = serde_json::from_slice(&fs::read(path)?)?;
        config.runtime.ticket.key = required_env("APP_TICKET_KEY")?;
        config.runtime.internal_token = required_env("APP_INTERNAL_TOKEN")?;
        config.runtime.admin.token = optional_env("APP_ADMIN_TOKEN");
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    let discovery = Arc::new(app.discovery.build()?);
    GatewayLauncher::new(app.runtime)?
        .with_world_discovery(discovery)
        .run()
        .await
}

fn required_env(name: &str) -> elura::Result<String> {
    env::var(name).map_err(|_| elura::Error::InvalidConfig(format!("{name} is required")))
}

fn optional_env(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}
```

Elura does not read JSON or environment variables itself. `AppConfig::load()`
is ordinary application code and can be replaced with another configuration or
secret system.

## 4. Add local configuration

Use loopback listeners and point DNS discovery at the local World process:

```json [config/world.json]
{
  "runtime": {
    "world": {
      "listen": "127.0.0.1:18000"
    },
    "admin": {
      "listen": "127.0.0.1:18001",
      "component": "world",
      "instance_id": "world-local"
    }
  }
}
```

```json [config/gateway.json]
{
  "runtime": {
    "gateway": {
      "listen": "127.0.0.1:17000"
    },
    "ticket": {
      "issuer": "game-login",
      "audience": "game-gateway"
    },
    "admin": {
      "listen": "127.0.0.1:17001",
      "component": "gateway",
      "instance_id": "gateway-local"
    },
    "world_routing": {
      "pool_size": 1,
      "max_in_flight_per_connection": 64
    }
  },
  "discovery": {
    "endpoint": "127.0.0.1:18000",
    "region_id": 1,
    "realm_id": 1,
    "route": 0,
    "refresh_interval": { "secs": 1, "nanos": 0 }
  }
}
```

Serde fills omitted runtime settings from their development defaults and rejects
unknown fields.

## 5. Create secrets and run

Run `openssl rand -hex 32` twice and put the two different results in a local
environment file:

```dotenv [config/elura.env]
APP_TICKET_KEY=replace-with-the-first-random-value
APP_INTERNAL_TOKEN=replace-with-the-second-random-value
```

Add `config/elura.env` to `.gitignore` and never commit real secrets. Start the
World first, then start the Gateway in another terminal. Load the same file in
both terminals:

::: code-group

```bash [Terminal 1 — World]
set -a
. config/elura.env
set +a
cargo run --bin world
```

```bash [Terminal 2 — Gateway]
set -a
. config/elura.env
set +a
cargo run --bin gateway
```

:::

Check the private admin endpoints after discovery has completed its first
refresh:

```bash
curl -i http://127.0.0.1:18001/healthz
curl -i http://127.0.0.1:17001/healthz
curl -i http://127.0.0.1:17001/readyz
```

Healthy endpoints return `204 No Content`.

## What the CLI adds

The manual application above uses the same public APIs as generated code. The
CLI additionally creates environment examples, a business configuration
example, Docker files, Kubernetes manifests, and safe regeneration controls.
It does not add a hidden runtime or become a production dependency.

Continue with [World modules and routes](/guides/world-development) to organize
handlers, or use the [CLI reference](./cli) when you want the complete
application scaffold.
