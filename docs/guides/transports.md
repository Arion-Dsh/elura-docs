# Client transports

Client transports are Gateway endpoints that carry ELR2 game sessions. TCP,
UDP, WebSocket, WebTransport, QUIC, and custom transports all enter the same
Session engine; they are separate from
[application HTTP](./application-http) and the private admin server.

Do not mount an ELR2 WebSocket endpoint with `Gateway::http`. The built-in
WebSocket endpoint is a `GatewayTransport` and shares authentication, limits,
routing, Push, and graceful shutdown with every other built-in transport.

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
| ELR2/QUIC | `QuicConfig` | `127.0.0.1:17003` | Certificate, key, reliable/hybrid mode, Datagram routes and limits |
| ELR2/UDP | `UdpConfig` | `127.0.0.1:17004` | Datagram bytes, peer Sessions, per-peer queue |
| ELR2/WebTransport | `WebTransportConfig` | `127.0.0.1:17005` | HTTP/3 identity, path, origins, reliable/datagram mode |

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
project. Its default ALPN is `elura.v2`, and one ELR2 Session always opens the
first client-initiated bidirectional stream.

`QuicMode::ReliableStream`, the default, carries every ELR2 frame on that
stream. `QuicMode::Hybrid` keeps framework and durable application routes on
the stream while selected realtime application routes use QUIC Datagrams:

```rust
use elura::transport::{QuicConfig, QuicMode};

let mut quic = QuicConfig::from_pem_files(
    "0.0.0.0:17003".parse()?,
    "certs/quic-cert.pem",
    "certs/quic-key.pem",
);
quic.mode = QuicMode::Hybrid;
quic.datagram_routes = vec![120, 121]; // input and replication packets
quic.max_datagram_bytes = 1100;
quic.datagram_queue = 64;

gateway = gateway.transport(quic);
```

Hybrid mode requires at least one unique route ID at or above `100`, and the
peer must support QUIC Datagrams. Authentication and all other framework
routes remain reliable. The client must use the same route policy in both
directions. Each Datagram contains exactly one complete ELR2 frame; malformed,
oversized, and excess best-effort traffic may be discarded. Keep inventory,
rewards, match lifecycle, and other durable commands off `datagram_routes`.

### UDP

Every UDP datagram must contain exactly one complete ELR2 frame. A source
address identifies one best-effort Gateway Session until authentication,
heartbeat, idle timeout, or Session closure removes it. The default maximum
datagram size is 1200 bytes to avoid IP fragmentation on common paths.

UDP does not add delivery, ordering, congestion control, or connection
migration. Use input sequence numbers, redundancy, ACKs, and bounded reorder
windows from `elura-netcode` for gameplay traffic that can tolerate best-effort
delivery. Use a reliable transport for messages whose protocol does not define
recovery.

Malformed and oversized datagrams are discarded before a Session is created.
`max_sessions` and `per_session_queue` bound source-address state and buffered
work.

### WebTransport

WebTransport runs over HTTP/3 and always requires a TLS certificate and key.
Construct `WebTransportConfig::from_pem_files`, configure the CONNECT path and
origin policy, then select one channel:

- `WebTransportMode::ReliableStream` accepts one client-initiated
  bidirectional stream carrying the ELR2 byte stream;
- `WebTransportMode::Datagram` requires each WebTransport Datagram to contain
  one complete ELR2 frame and preserves message boundaries.

The default path is `/elura/game`. When `allowed_origins` is empty, a browser
Origin must match the request authority. Non-browser clients that omit Origin
require the explicit `allow_missing_origin` setting. Handshake, stream-open,
idle, pending-handshake, datagram-size, and queue limits are all bounded.

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
  addresses within the same socket namespace. `0.0.0.0:17000` conflicts with
  every other TCP listener on port `17000`.
- Invalid transport settings and listener conflicts are returned by `build()`
  or `run()`; fluent registration does not panic.
- Endpoints conflict only within the same operating-system socket namespace;
  a TCP and UDP listener may use the same numeric port.
- TCP, WebSocket, QUIC, and WebTransport own their client-facing TLS settings
  independently.
- All registered transports stop and drain with the Gateway lifecycle.
