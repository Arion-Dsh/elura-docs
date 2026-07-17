# Crates and feature flags

The workspace is split into focused crates. Most applications depend on the
`elura` facade and enable concrete features there.

## Workspace crates

| Crate | Purpose | Published application dependency? |
| --- | --- | --- |
| `elura` | Unified facade and feature selection | Yes, recommended |
| `elura-core` | Protocol, sessions, routing, tickets, realtime primitives | For low-level integrations |
| `elura-runtime` | Lifecycle, security, administration, and observability | Usually through `elura` |
| `elura-gateway` | Client connection and session runtime | Usually through `elura` |
| `elura-world` | Command and player-state runtime | Usually through `elura` |
| `elura-monolith` | Single-process Gateway and World composition | Usually through `elura` |
| `elura-adapters` | Redis, SQL, DNS, Kubernetes, outbox adapters | Usually through `elura` |
| `elura-providers` | Identity, OTP, SMS, payment providers | Usually through `elura` |
| `elura-cli` | Project scaffolding binary | Install as a tool |
| `elura-load` | Connection/request load generator | Development only |
| `elura-perf` | Reproducible performance scenarios | Workspace/internal |

## Facade features

The `elura` crate enables `gateway` and `world` by default. Both include
`runtime`, and `runtime` includes `core`.

| Feature | Enables |
| --- | --- |
| `core` | `elura-core` |
| `runtime` | `core`, `elura-runtime` |
| `gateway` | `runtime`, `elura-gateway` |
| `world` | `runtime`, `elura-world` |
| `monolith` | `gateway`, `world`, `elura-monolith` |
| `adapters` | `runtime`, base `elura-adapters` |
| `redis` | `adapters`, `gateway`, `world`, Redis adapter implementations |
| `sql` | `adapters`, SQL adapter implementations |
| `kubernetes` | `adapters`, `gateway`, Kubernetes adapter implementations |
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
    AdminServerConfig, Gateway, GatewayConfig, Identity, OnlineBackend,
    OnlineDirectory, OnlineStatsReader, Route, SessionEvent, SessionObserver,
    TcpConfig, TcpTransport, World, WorldConfig, WorldContext,
};
```

The online contracts are in the prelude; concrete backends remain explicit:

```rust
use elura::adapters::online::RedisOnlineDirectory; // `redis`
```

Use domain modules when the responsibility should remain visible at the call
site:

```rust
use elura::world::{World, WorldModule, WorldModuleRegistry};
use elura::world::middleware::LoggingMiddleware;
use elura::world::testing::WorldHarness;
use elura::gateway::GatewayInfrastructure;
```

Concrete infrastructure and provider implementations are never added to the
prelude. Import them through their feature-gated namespaces:

```rust
use elura::adapters::discovery::{DnsWorldDiscovery, DnsWorldDiscoveryConfig};
use elura::adapters::replay::RedisReplayStore; // `redis`
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
elura = "0.2.2"

# DNS discovery types live in the adapter crate without a concrete optional
# backend, so the generated split project starts with this feature.
elura = { version = "0.2.2", features = ["adapters"] }

# Redis-backed distributed application
elura = { version = "0.2.2", features = ["redis"] }

# Kubernetes discovery and SQL account versions
elura = { version = "0.2.2", features = ["kubernetes", "sql"] }
```

The CLI writes its exact Elura release into generated manifests. Keep the CLI
and facade crate on the same release so generated source matches the imported
API.

## Rustdoc

Use docs.rs for item-level signatures and this site for architecture and
operational guidance:

- `https://docs.rs/elura`
- `https://docs.rs/elura-core`
- `https://docs.rs/elura-runtime`
- `https://docs.rs/elura-adapters`
- `https://docs.rs/elura-providers`
