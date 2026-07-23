# Client protocol SDKs

Elura can generate local protocol libraries for C++20, C# 9 / .NET Standard
2.1 (including Unity 6.3 LTS), and strict TypeScript. They implement the public
Gateway-to-client ELR2 v2 contract so a client does not need to re-create
binary framing, reserved routes, or built-in payloads by hand.

These are ports of the same wire contract used by Rust's
`elura_core::protocol::FrameCodec`; they are not alternative protocols. The
same frame encoded in Rust, C++20, C#, or TypeScript produces identical bytes.

## Generate the libraries

Generate every supported language into the current application:

```bash
elura init sdk --dir .
```

Generate only one language when the application does not need the full set:

```bash
elura init sdk --language cpp --dir .
elura init sdk --language csharp --dir .
elura init sdk --language typescript --dir .
```

The command accepts the same `--dry-run` and `--force` behavior as the other
scaffolds. Existing customized files are preserved by default.

## What each SDK contains

| Output | Runtime | Included checks |
| --- | --- | --- |
| `sdk/cpp/` | Dependency-free C++20 | CMake/CTest golden vectors |
| `sdk/csharp/` | C# 9 / .NET Standard 2.1; Unity 6.3 LTS compatible | Golden-vector executable on .NET 8 |
| `sdk/typescript/` | Dependency-free strict ES module for browsers and Node.js | Node test runner and type check |

All three implement frame encoding, exact-message decoding, TCP stream
reassembly, reserved routes, standard errors, authentication and reconnect
payloads, and Session Control protobuf encoding. TypeScript and C# provide JSON
encoders and decoders for those built-in payloads; C++ exposes the matching
model structs for the application's selected JSON library. They also include
`proto/session_control.proto` for applications that prefer generated protobuf
types.

The standard error model includes optional `retry_after_ms`. For a retryable
`REALM_FULL`, return to the application login queue or wait at least that delay;
do not spin on Gateway authentication.

The SDKs intentionally do **not** open sockets or dispatch application routes.
Your client still owns connection lifecycle, renewal scheduling, reconnect
backoff, request correlation, and encoding for routes `100+`.

## Minimal application usage

The generated APIs keep framing separate from the transport selected by the
application. The transport only sends encoded bytes and passes received bytes
back to the SDK.

::: code-group

```cpp [C++20]
#include <elura/elr2.hpp>

auto request = elura::Frame::request(
    100, next_request_id++, elura::to_bytes(R"({"x":10,"y":20})"));
send_bytes(elura::encode_frame(request));

elura::StreamDecoder decoder;
decoder.append(received_chunk);
while (auto frame = decoder.next()) {
  handle(*frame);
}
```

```csharp [Unity / C# 9]
var request = GatewayFrames.Authenticate(nextRequestId++, loginTicket);
transport.Send(Elr2Codec.Encode(request));

decoder.Append(receivedChunk);
while (decoder.TryRead(out var frame))
{
    Handle(frame!);
}
```

```ts [TypeScript]
import { Elr2, Gateway } from "@elura/protocol";

const request = Gateway.authenticate(nextRequestId++, loginTicket);
socket.send(Elr2.encode(request));

socket.binaryType = "arraybuffer";
socket.onmessage = ({ data }) => handle(Elr2.decode(data as ArrayBuffer));
```

:::

C++ accepts `std::vector`, `std::array`, and `std::span` byte ranges directly.
C# supplies built-in authentication/reconnect JSON codecs without depending on
`System.Text.Json`. TypeScript accepts string payloads as UTF-8 and accepts both
`ArrayBuffer` and `Uint8Array` inputs.

## Silent reconnect flow

1. Decode the route `1` authentication response and securely retain only
   `response.reconnect.ticket`.
2. Schedule renewal before `response.reconnect.expires_in_seconds` elapses.
3. While connected, send the current ticket as `ReconnectTicketRequest` to
   route `3`. TypeScript and C# expose `encodeReconnectRequest(currentTicket)`;
   C++ applications serialize the provided model with their JSON library.
4. Replace the stored ticket only after decoding the successful renewal
   response.
5. After a disconnect, open a new transport and call route `1` with the stored
   reconnect ticket. Save the reconnect ticket from the new authentication
   response.
6. If no valid reconnect ticket exists, obtain a login ticket from the
   application login service through its refresh-session flow.

The ticket is a credential. Keep it out of logs and application telemetry.

## Transport contract

- TCP and reliable QUIC streams carry consecutive encoded ELR2 frames. Feed
  received bytes through the provided stream decoder because one read may
  contain a partial frame or several frames.
- Each WebSocket binary message contains exactly one ELR2 frame. Negotiate
  `elura.v2` as the WebSocket subprotocol. QUIC uses the same identifier as its
  ALPN value.
- Each UDP, WebTransport Datagram, or QUIC Hybrid Datagram contains exactly one
  complete ELR2 frame. A QUIC Hybrid client must use the same configured route
  set as the server; framework and unselected routes remain on the reliable
  stream. The client must provide sequence, redundancy, ACK, and recovery
  semantics for best-effort gameplay messages.
- A WebTransport reliable bidirectional stream follows the same byte-stream
  framing rules as TCP and QUIC.
- WebSocket text messages are not part of ELR2.
- Request IDs are non-zero client-generated `u64` values. TypeScript accepts a
  normal safe-integer `number` for convenient counters and also accepts
  `bigint` when the full unsigned 64-bit range is required; decoded IDs are
  represented as `bigint`. Allocate a new request ID for each retry attempt so
  late responses remain distinguishable; keep any business operation ID stable
  inside the application payload.

Read [ELR2 protocol](../concepts/protocol) for the frame layout, reserved route
sequence, retry behavior, and compatibility rules.

The generated SDKs handle ELR2 bytes but do not implement sockets, client
prediction, remote interpolation, or an engine entity model. See
[Realtime gameplay](./realtime-gameplay) for those integration boundaries.

## Verify generated code

Run the check that matches the generated language before integrating transport
code:

::: code-group

```bash [C++]
cmake -S sdk/cpp -B sdk/cpp/build -DBUILD_TESTING=ON
cmake --build sdk/cpp/build
ctest --test-dir sdk/cpp/build --output-on-failure
```

```bash [C#]
dotnet run --project \
  sdk/csharp/Elura.Protocol.Tests/Elura.Protocol.Tests.csproj
```

```bash [TypeScript]
cd sdk/typescript
npm install
npm test
```

:::

These checks use the same golden protocol vectors across languages. Run them
again after regenerating SDKs during an Elura upgrade.

## Application messages

The generated libraries cover Elura's reserved Gateway routes and wire
envelope. For a game route such as `inventory.equip_item` with ID `120`, define
the request and response protobuf messages in the application, generate the
normal language-specific protobuf types, encode the request into an ELR2 frame,
and decode the correlated response payload with the same schema.

The Rust server binds the ID and protobuf types in its `Route` implementation.
Expose the same ID and schema to client builds through generated application
code or another reviewed single source of truth. IDs below `100` belong to the
runtime and must not be allocated to game commands.

## Upgrade safely

Generated SDKs are source code inside the upper application, not separately
versioned package dependencies. Before replacing customized files:

1. run `elura init sdk --dry-run` with the new CLI;
2. compare template changes with local transport integration;
3. regenerate and rerun golden-vector tests;
4. deploy compatible clients before requiring a new protocol version.

Elura may change APIs during `0.x`, while the on-wire version remains explicit.
Pin the CLI version used to generate release clients.
