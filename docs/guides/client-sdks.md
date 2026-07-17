# Client protocol SDKs

Elura can generate local protocol libraries for C++17, .NET 8/C#, and
TypeScript. They implement the public Gateway-to-client ELR2 v2 contract so a
client does not need to re-create binary framing, reserved routes, or built-in
payloads by hand.

These are ports of the same wire contract used by Rust's
`elura_core::protocol::FrameCodec`; they are not alternative protocols. The
same frame encoded in Rust, C++17, C#, or TypeScript produces identical bytes.

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
| `sdk/cpp/` | Dependency-free C++17 | CMake/CTest golden vectors |
| `sdk/csharp/` | Dependency-free .NET 8 library | Golden-vector executable |
| `sdk/typescript/` | TypeScript ES module | Node test runner and type check |

All three implement frame encoding, exact-message decoding, TCP stream
reassembly, reserved routes, standard errors, authentication and reconnect
payloads, and Session Control protobuf encoding. TypeScript and C# provide JSON
encoders and decoders for those built-in payloads; C++ exposes the matching
model structs for the application's selected JSON library. They also include
`proto/session_control.proto` for applications that prefer generated protobuf
types.

The SDKs intentionally do **not** open sockets or dispatch application routes.
Your client still owns connection lifecycle, renewal scheduling, reconnect
backoff, request correlation, and encoding for routes `100+`.

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

- TCP and QUIC streams carry consecutive encoded ELR2 frames. Feed received
  bytes through the provided stream decoder because one read may contain a
  partial frame or several frames.
- Each WebSocket binary message contains exactly one ELR2 frame. Negotiate
  `elura.v2` as the WebSocket subprotocol. QUIC uses the same identifier as its
  ALPN value.
- WebSocket text messages are not part of ELR2.
- Request IDs are non-zero client-generated `u64` values. The TypeScript SDK
  represents them as `bigint` to preserve the full range.

Read [ELR2 protocol](../concepts/protocol) for the frame layout, reserved route
sequence, retry behavior, and compatibility rules.

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
