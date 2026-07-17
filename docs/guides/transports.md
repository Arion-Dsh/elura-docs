# Client transports

Client transports are Gateway endpoints that carry ELR2 game sessions. TCP,
WebSocket, QUIC, and custom transports all enter the same Session engine; they
are separate from [application HTTP](./application-http) and the private admin
server.

Do not mount an ELR2 WebSocket endpoint with `Gateway::http`. The built-in
WebSocket endpoint is a `GatewayTransport` and shares authentication, limits,
routing, Push, and graceful shutdown with TCP and QUIC.

## Install transports

`GatewayConfig` is transport-neutral. A Gateway must install at least one
transport before `build()` or `run()`, and it may install several endpoints:

```rust
use elura::prelude::*;

let tcp = TcpTransport::new(tcp_config)?;
let mut gateway = Gateway::new(gateway_config).transport(tcp);

let mut websocket = WebSocketConfig::default();
websocket.listen = "0.0.0.0:17002".parse().expect("static address");
websocket.allowed_origins = vec!["https://game.example.com".into()];
gateway = gateway.transport(websocket);

if let Some(quic) = quic_config {
    gateway = gateway.transport(quic);
}

gateway
    .world_discovery(discovery)
    .run(admin_config)
    .await?;
```

Each `.transport(...)` call registers one independently bound endpoint. All
endpoints feed the same `GatewayServer`, so connection limits, authenticated
sessions, replay handling, interceptors, World routing, Push, and shutdown are
shared.

## Built-in transports

| Transport | Install value | Default address | Important settings |
| --- | --- | --- | --- |
| ELR2/TCP | `TcpTransport::new(TcpConfig)?` | `127.0.0.1:17000` | Keepalive, TLS, pending handshakes, Proxy Protocol |
| ELR2/WebSocket | `WebSocketConfig` | `127.0.0.1:17002` | Path, subprotocol, origins, TLS, trusted proxies |
| ELR2/QUIC | `QuicConfig` | `127.0.0.1:17003` | Certificate, key, ALPN, idle/handshake timeouts |

### TCP

TCP configuration is serializable. The generated project keeps it in the
top-level `tcp` object, separate from `runtime`:

```json
{
  "runtime": {},
  "tcp": {
    "listen": "0.0.0.0:17000",
    "keepalive": { "secs": 30, "nanos": 0 },
    "tls_handshake_timeout": { "secs": 5, "nanos": 0 },
    "max_pending_handshakes": 1024,
    "tls": null,
    "proxy_protocol": null
  }
}
```

Construct it before registering the endpoint:

```rust
let tcp = TcpTransport::new(app.tcp)?;
let gateway = Gateway::new(app.runtime).transport(tcp);
```

Only enable Proxy Protocol for explicitly trusted proxy CIDRs. TCP TLS and
Proxy Protocol belong to `TcpConfig` or the corresponding `TcpTransport`
builder methods, not `GatewayConfig`.

### WebSocket

`WebSocketConfig` defaults to path `/elura/game` and requires the `elura.v2`
subprotocol. Browser origins must match the request host unless
`allowed_origins` is configured. Non-browser clients that omit `Origin` require
`allow_missing_origin = true`; enable that only for clients you intend to
support.

Construct this configuration in code. If it belongs in JSON, define an
application-owned deserializable settings type and map its validated values to
`WebSocketConfig`.

### QUIC

QUIC always uses TLS 1.3. Construct `QuicConfig` with certificate and key paths,
or deserialize the optional top-level `quic` object used by the generated
project. Its default ALPN is `elura.v2`, and one ELR2 Session uses the first
client-initiated bidirectional stream.

## Custom transports

A custom endpoint implements both `GatewayTransport` and
`GatewayTransportListener`. The listener yields a peer address and an I/O value
implementing Tokio `AsyncRead + AsyncWrite`. Elura then applies its normal ELR2
framing and Session engine to that byte stream.

Implement `validate`, `bind`, and bounded accept/handshake behavior in the
transport. The application installs it with the same call:

```rust
let gateway = Gateway::new(config).transport(MyTransport::new(settings)?);
```

Custom transport crates normally need `async-trait = "0.1"` and `tokio` in
addition to `elura`. See the `GatewayTransport` and `GatewayTransportListener`
Rustdoc for the required associated listener and I/O bounds.

## Listener rules

- At least one transport is required.
- Transport, application HTTP, and admin listeners must use non-conflicting
  addresses. `0.0.0.0:17000` conflicts with every listener on port `17000`.
- Invalid transport settings and listener conflicts are returned by `build()`
  or `run()`; fluent registration does not panic.
- TCP, WebSocket, and QUIC own their client-facing TLS settings independently.
- All registered transports stop and drain with the Gateway lifecycle.
