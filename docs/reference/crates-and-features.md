# Crates and feature flags

The workspace is split into focused crates. Most applications depend on the
`elura` facade and enable concrete features there.

## Workspace crates

| Crate | Purpose | Published application dependency? |
| --- | --- | --- |
| `elura` | Unified facade and feature selection | Yes, recommended |
| `elura-core` | Protocol, sessions, routing, tickets, realtime primitives | For low-level integrations |
| `elura-runtime` | Gateway, World, transport, launchers, observability | Usually through `elura` |
| `elura-adapters` | Redis, SQL, DNS, Kubernetes, outbox adapters | Usually through `elura` |
| `elura-providers` | Identity, OTP, SMS, payment providers | Usually through `elura` |
| `elura-cli` | Project scaffolding binary | Install as a tool |
| `elura-load` | Connection/request load generator | Development only |
| `elura-perf` | Reproducible performance scenarios | Workspace/internal |

## Facade features

The `elura` crate enables `runtime` by default; `runtime` includes `core`.

| Feature | Enables |
| --- | --- |
| `core` | `elura-core` |
| `runtime` | `core`, `elura-runtime` |
| `adapters` | `runtime`, base `elura-adapters` |
| `redis` | `adapters`, Redis adapter implementations |
| `sql` | `adapters`, SQL adapter implementations |
| `kubernetes` | `adapters`, Kubernetes adapter implementations |
| `admin` | `adapters`, adapter-backed admin capabilities |
| `providers` | `core`, base `elura-providers` |
| `identity` | identity provider set |
| `notification-alisms` | Aliyun SMS notification provider |
| `otp` | OTP service and store integration |
| `payment-alipay` | Alipay |
| `payment-apple` | Apple purchase verification |
| `payment-douyin` | Douyin payment |
| `payment-quicksdk` | QuickSDK payment |
| `payment-wechat-mini` | WeChat Mini Program payment |
| `payment-wechat-pay` | WeChat Pay |
| `full` | All adapters and providers above |

## Facade imports

The facade keeps its crate root intentionally small: `elura::Error` and
`elura::Result` are available there, while the rest of the API is organized by
responsibility.

Use the prelude for common application contracts and runtime types:

```rust
use elura::prelude::{
    GatewayLaunchConfig, GatewayLauncher, Identity, WorldBuilder, WorldContext,
};
```

Use domain modules when the responsibility should remain visible at the call
site:

```rust
use elura::world::{WorldBuilder, WorldModule};
use elura::world::middleware::LoggingMiddleware;
use elura::world::testing::WorldHarness;
use elura::gateway::GatewayInfrastructure;
```

Concrete infrastructure and provider implementations are never added to the
prelude. Import them through their feature-gated namespaces:

```rust
use elura::adapters::discovery::DnsWorldDiscoveryConfig;
use elura::adapters::redis::RedisReplayStore; // `redis`
use elura::providers::identity::GuestProvider; // `identity`
use elura::providers::payment::WechatPayPayment; // `payment-wechat-pay`
```

This split makes dependencies on Redis, Kubernetes, SQL, or third-party APIs
easy to see during review. Feature flags still determine whether a module or
item is available. Provider operations use
`elura::providers::ProviderResult`; common provider traits are also available
from the prelude when their feature is enabled.

## Examples

```toml
# Gateway + World runtime only (default)
elura = "0.1.1"

# DNS discovery types live in the adapter crate without a concrete optional
# backend, so the generated split project starts with this feature.
elura = { version = "0.1.1", features = ["adapters"] }

# Redis-backed distributed application
elura = { version = "0.1.1", features = ["redis"] }

# Kubernetes discovery and SQL account versions
elura = { version = "0.1.1", features = ["kubernetes", "sql"] }
```

During `0.x`, pin a precise compatible version and review release notes before
upgrading.

## Rustdoc

Use docs.rs for item-level signatures and this site for architecture and
operational guidance:

- `https://docs.rs/elura`
- `https://docs.rs/elura-core`
- `https://docs.rs/elura-runtime`
- `https://docs.rs/elura-adapters`
- `https://docs.rs/elura-providers`
