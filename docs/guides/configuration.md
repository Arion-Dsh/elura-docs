# Configuration

Elura configuration structs are serializable, but loading and merging settings
is owned by the application. The generated project uses JSON for non-secrets
and environment variables for secrets and deployment overrides.

## Composition pattern

```rust
use elura::adapters::discovery::DnsWorldDiscoveryConfig;
use elura::prelude::GatewayLaunchConfig;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: GatewayLaunchConfig,
    discovery: DnsWorldDiscoveryConfig,
}
```

The application should:

1. Load its non-secret configuration.
2. Resolve secrets from environment or a secret manager.
3. Apply deployment overrides.
4. Build each selected adapter.
5. Inject adapters into a launcher.

Secret fields such as ticket keys and internal tokens are skipped by Serde so
they cannot accidentally appear in serialized runtime configuration.

## Duration format

Serde encodes `std::time::Duration` as seconds and nanoseconds:

```json
{ "secs": 5, "nanos": 0 }
```

Both fields are integers. Most timeouts must be positive.

## Gateway defaults

`GatewayConfig` provides safe development defaults. Important values include:

| Setting | Default |
| --- | --- |
| `listen` | `127.0.0.1:17000` |
| `max_connections` | `10000` |
| `max_connections_per_ip` | `100` |
| `max_payload` | `1048576` bytes |
| `request_rate` / `request_burst` | `200` / `400` |
| `inbound_queue` / `response_queue` / `push_queue` | `64` / `64` / `64` |
| `idle_timeout` | 90 seconds |
| `authentication_timeout` | 10 seconds |
| `handler_timeout` | 5 seconds |
| `heartbeat_interval` | 30 seconds |
| `shutdown_timeout` | 10 seconds |
| response cache TTL / capacity | 10 seconds / `128` |

Authentication route `1` is limited by default to 5 requests per second with a
burst of 5. Add `route_rate_limits` for expensive application routes.

## World defaults

| Setting | Default |
| --- | --- |
| `listen` | `127.0.0.1:18000` |
| `max_payload` | `1048576` bytes |
| `max_connections` | `1024` |
| `max_in_flight_per_connection` | `64` |
| `handler_timeout` | 5 seconds |
| `shutdown_timeout` | 10 seconds |
| idempotency TTL / capacity | 30 seconds / `10000` |

Tune Gateway connection-pool capacity and World in-flight limits together. A
pool of `N` connections with `M` in-flight commands each can offer up to `N × M`
queued/in-flight commands per target before other protection layers apply.

## Admin configuration

Default admin listeners are `127.0.0.1:17001` for Gateway and
`127.0.0.1:18001` for World. A non-loopback listener requires an admin token of
at least 32 bytes. Health, readiness, and version are unauthenticated; metrics,
debug, and mutation endpoints use `Authorization: Bearer <token>` when a token
is configured.

## TLS and proxy protocol

Gateway and World launch configurations accept optional server certificate and
key files. Gateway-to-World client TLS can include a CA file, client certificate
and key, and expected server name.

Only enable Proxy Protocol for traffic received from explicitly trusted CIDRs.
The runtime validates the proxy source and applies a bounded header size and
timeout. Never trust Proxy Protocol from the public internet directly.
