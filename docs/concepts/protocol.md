# ELR2 protocol

ELR2 is Elura’s binary framing protocol for client and internal command traffic.
All integer fields are encoded in network byte order (big-endian).

## Frame layout

Every frame starts with a fixed 28-byte header:

| Offset | Size | Field | Description |
| --- | --- | --- | --- |
| 0 | 4 | Magic | `0x454C5232`, ASCII `ELR2` |
| 4 | 2 | Version | `2` |
| 6 | 1 | Kind | Request `1`, response `2`, push `3`, error `4` |
| 7 | 1 | Flags | Currently `0`; other values are rejected |
| 8 | 4 | Route | Runtime or application route ID |
| 12 | 8 | Request ID | Non-zero for request/response/error; zero for push |
| 20 | 4 | Sequence | Session ordering/reconnect sequence |
| 24 | 4 | Payload length | Number of bytes after the header |
| 28 | N | Payload | Opaque to the frame codec; commonly protobuf or JSON |

The default maximum payload is 1 MiB. `FrameCodec` permits configured limits up
to 64 MiB, but application limits should stay as small as practical.

## Frame kinds

- **Request** starts an operation and must use a non-zero request ID.
- **Response** correlates to the request ID, route, and sequence of a request.
- **Push** is server-initiated and must use request ID `0`.
- **Error** correlates to a request and carries a serialized error envelope.

For WebSocket transport, one binary WebSocket message must contain exactly one
ELR2 frame and the client must negotiate `elura.v2` as the subprotocol. QUIC
uses `elura.v2` as ALPN. Text WebSocket messages are not part of the protocol.

Elura can generate matching C++17, C#, and TypeScript codecs. See
[Client protocol SDKs](../guides/client-sdks) for the integration boundary and
transport-specific checks.

## The same protocol in every language

The Rust `Frame` and `FrameCodec` implementation is the ELR2 reference
implementation, not a Rust-only transport. Generated C++17, C#, and TypeScript
SDKs encode the same 28-byte header, integer byte order, frame kinds, validation
rules, and payload bytes. Cross-language golden vectors verify byte-for-byte
compatibility.

Do not replace ELR2 with a Rust-specific serialization format such as a native
struct layout or `bincode` when non-Rust clients must connect. Those formats do
not define a stable cross-language ABI. ELR2 provides language-neutral framing;
protobuf provides language-neutral application request and response payloads.

## Route ranges

| Route | Meaning |
| --- | --- |
| `1` | Authenticate |
| `2` | Heartbeat |
| `3` | Renew the current reconnect ticket |
| `4` | Session control |
| `5..99` | Reserved for future runtime use |
| `100+` | Application routes |

Do not allocate application IDs below `100`. On the Rust server, each typed
application route implements `Route`, which binds its ID, diagnostic name,
protobuf request, and protobuf response. `World::route` records duplicate IDs
and names and returns the error from `build()` or `run()`. A reusable
`WorldModule` registers routes through `WorldModuleRegistry::route`. Clients
must use the same route ID and protobuf schema.

## Application payloads and errors

Typed application `Request` and successful `Response` payloads are protobuf
messages declared by the application. A failed request uses kind `4` and the
canonical UTF-8 JSON error envelope:

```json
{
  "code": "NOT_ENOUGH_GOLD",
  "message": "not enough gold",
  "retryable": false
}
```

`code` uses uppercase ASCII letters, digits, and underscores and is at most 64
bytes. `message` is at most 1024 bytes. The error frame keeps the original
request's route, request ID, and sequence. Because an error is a request result,
its request ID cannot be zero; server-initiated notifications use `Push`.

## Authentication sequence

```text
Client                         Gateway                         World
  │                               │                              │
  ├── request route=1, ticket ───>│                              │
  │                               ├── verify signature/claims    │
  │                               ├── check replay/admission     │
  │<── response session+identity  │                              │
  │    + reconnect ticket ────────┤                              │
  │                               │                              │
  ├── request route>=100 ────────>│                              │
  │                               ├── authenticated command ────>│
  │                               │<── result/error ─────────────┤
  │<── response/error ────────────┤                              │
```

Unauthenticated sessions must authenticate within the Gateway’s
`authentication_timeout`. Normal requests are subject to global and per-route
token buckets, bounded queues, payload limits, handler timeouts, and idle
timeouts.

Authentication route `1` accepts a single-use login or reconnect ticket:

```json
{ "ticket": "signed-ticket" }
```

Its response contains `session_id`, `identity`, and the next reconnect ticket:

```json
{
  "session_id": "0195d8f4-48e8-7c42-b91c-c5d42b055cf5",
  "identity": {
    "account_id": 10,
    "user_id": 20,
    "region_id": 1,
    "realm_id": 2,
    "generation": 1
  },
  "reconnect": {
    "ticket": "signed-reconnect-ticket",
    "expires_in_seconds": 1800
  }
}
```

Route `3` is available only to an authenticated session. Its request must carry
the current reconnect ticket, which is consumed before the replacement is
returned:

```json
{ "ticket": "current-reconnect-ticket" }
```

```json
{
  "ticket": "replacement-reconnect-ticket",
  "expires_in_seconds": 1800
}
```

An actual reconnect opens a new transport and sends the saved reconnect ticket
to route `1`. It does not send route `3` on an unauthenticated connection.

## Request IDs and retries

Request IDs are client-generated correlation identifiers and must be non-zero.
The Gateway maintains a bounded response cache for recently completed requests.
Retries should reuse the same request ID and route within the configured TTL.
Do not treat this in-memory cache as durable exactly-once delivery; business
operations that require idempotency need an application-owned durable key and
transactional constraint.

## Compatibility

The codec rejects an unknown magic value, unsupported version, unknown kind,
invalid request ID, oversized payload, or malformed message length. Version
protocol changes explicitly; do not change field meanings while retaining
version `2`.
