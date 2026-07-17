# Configuration

Elura configuration structs are serializable, but loading and merging settings
is owned by the application. The generated project uses JSON for non-secrets
and environment variables for secrets and deployment overrides.

## Composition pattern

```rust
use elura::adapters::discovery::DnsWorldDiscoveryConfig;
use elura::prelude::{AdminServerConfig, GatewayConfig, TcpConfig};

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: GatewayConfig,
    admin: AdminServerConfig,
    tcp: TcpConfig,
    discovery: DnsWorldDiscoveryConfig,
}
```

The application should:

1. Load its non-secret configuration.
2. Resolve secrets from environment or a secret manager.
3. Apply deployment overrides.
4. Build each selected adapter.
5. Construct transports and adapters, then inject them into `Gateway`, `World`,
   or `Monolith`.

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
| `max_connections` | `10000` |
| `max_connections_per_ip` | `100` |
| `max_payload` | `1048576` bytes |
| `request_rate` / `request_burst` | `200` / `400` |
| `inbound_queue` / `response_queue` / `push_queue` | `64` / `64` / `64` |
| `idle_timeout` | 90 seconds |
| `authentication_timeout` | 10 seconds |
| `ticket.login_ttl` | 60 seconds |
| `ticket.reconnect_ttl` | 30 minutes |
| `handler_timeout` | 5 seconds |
| `heartbeat_interval` | 30 seconds |
| `shutdown_timeout` | 10 seconds |
| response cache TTL / capacity | 10 seconds / `128` |

Authentication route `1` is limited by default to 5 requests per second with a
burst of 5. Add `route_rate_limits` for expensive application routes.

Ticket configuration uses explicit login and reconnect lifetimes:

```json
{
  "ticket": {
    "issuer": "game-login",
    "audience": "game-gateway",
    "login_ttl": { "secs": 60, "nanos": 0 },
    "reconnect_ttl": { "secs": 1800, "nanos": 0 }
  }
}
```

The application login service and every Gateway must use the same key, issuer,
audience, and lifetimes. The key is injected separately because Serde skips it.

Client listeners no longer live in `GatewayConfig`. Each transport owns its
configuration and is installed explicitly. `TcpConfig` listens on
`127.0.0.1:17000` by default and also owns TCP keepalive, TLS handshake,
pending-handshake, certificate, and Proxy Protocol settings. WebSocket and QUIC
use their own configuration types.

## World defaults

| Setting | Default |
| --- | --- |
| `listen` | `127.0.0.1:18000` |
| `max_payload` | `1048576` bytes |
| `max_connections` | `1024` |
| `max_in_flight_per_connection` | `64` |
| `handler_timeout` | 5 seconds |
| `shutdown_timeout` | 10 seconds |

Tune Gateway connection-pool capacity and World in-flight limits together. A
pool of `N` connections with `M` in-flight commands each can offer up to `N × M`
queued/in-flight commands per target before other protection layers apply.

## Admin configuration

`AdminServerConfig` is separate from Gateway and World runtime configuration
and is passed to `.run(admin)`. The generated defaults are
`127.0.0.1:17001` for Gateway/monolith and `127.0.0.1:18001` for World. A
non-loopback listener requires an admin token of at least 32 bytes. Health,
readiness, and version are unauthenticated; metrics, debug, and mutation
endpoints use `Authorization: Bearer <token>` when a token is configured.

## TLS and proxy protocol

`TcpConfig` and `QuicConfig` own client-facing certificate settings, while
`WorldConfig` owns the standalone World server certificate. Gateway-to-World
client TLS remains in `GatewayConfig::world_tls` and can include a CA file,
client certificate and key, and expected server name.

Only enable Proxy Protocol for traffic received from explicitly trusted CIDRs.
The runtime validates the proxy source and applies a bounded header size and
timeout. Never trust Proxy Protocol from the public internet directly.

See [Client transports](./transports) for multi-transport assembly and
[Application HTTP services](./application-http) for supervised Axum routers.
