# Client SDKs

Elura provides official standalone SDK repositories for Rust, C++20, and C# /
Unity. The SDKs implement the same public ELR2 v2 wire contract used by the
Gateway. They are maintained and versioned independently from the server
repository.

The `elura` CLI does not generate or install client SDKs. Download the SDK for
your client language from its GitHub repository:

| Language | Official repository | Main packages |
| --- | --- | --- |
| Rust | [`Arion-Dsh/elura-sdk-rust`](https://github.com/Arion-Dsh/elura-sdk-rust) | `elura-protocol`, `elura-client` |
| C++20 | [`Arion-Dsh/elura-sdk-cpp`](https://github.com/Arion-Dsh/elura-sdk-cpp) | `elura::protocol`, `elura::client_core`, transport components |
| C# / Unity | [`Arion-Dsh/elura-sdk-csharp`](https://github.com/Arion-Dsh/elura-sdk-csharp) | `Elura.Protocol`, `Elura.Client.Core`, transport packages |

## Download from GitHub

::: code-group

```bash [Rust]
git clone https://github.com/Arion-Dsh/elura-sdk-rust.git
cd elura-sdk-rust
cargo test --workspace --all-features
```

```bash [C++20]
git clone https://github.com/Arion-Dsh/elura-sdk-cpp.git
cd elura-sdk-cpp
cmake -S . -B build -DBUILD_TESTING=ON
cmake --build build --parallel
ctest --test-dir build --output-on-failure
```

```bash [C# / Unity]
git clone https://github.com/Arion-Dsh/elura-sdk-csharp.git
cd elura-sdk-csharp
dotnet build Elura.sln -c Release
```

:::

Pin a release tag or commit hash for production builds instead of tracking
`main`.

## Rust

Use `elura-client` for a ready-to-use asynchronous Gateway client:

```toml
[dependencies]
elura-client = { path = "../elura-sdk-rust/crates/elura-client" }
```

```rust
use elura_client::EluraClient;

let client = EluraClient::connect(gateway_address, login_ticket).await?;
let snapshot: Snapshot = client
    .request_protobuf(120, &MoveRequest { dx: 1, dy: 0 })
    .await?;
```

TCP and UDP are available without optional features. Enable `websocket`,
`quic`, or `webtransport` only when the application uses that transport. Use
`elura-protocol` directly when only ELR2 framing and payload helpers are
needed.

The same Session driver handles authentication, heartbeats, request
correlation, Push delivery, reconnect-ticket renewal, and automatic reconnect
for every built-in transport.

## C++20

Add the repository with CMake `FetchContent`:

```cmake
include(FetchContent)
FetchContent_Declare(
  elura_sdk
  GIT_REPOSITORY https://github.com/Arion-Dsh/elura-sdk-cpp.git
  GIT_TAG <release-tag-or-commit>
)
FetchContent_MakeAvailable(elura_sdk)

target_link_libraries(my_game PRIVATE elura::transport_tcp)
```

Link only the component the application needs. For example,
`elura::transport_tcp` does not link WebSocket, QUIC, or WebTransport code.
The aggregate `elura::client` target remains available when every transport is
desired.

```cpp
#include <elura/client.hpp>

auto client = elura::EluraClient::connect(
    "127.0.0.1:17000",
    login_ticket_from_your_backend);

auto response = client
    .request(120, application_payload)
    .get();
```

## C# and Unity

After cloning the GitHub repository, reference only the transport project
required by the application:

```xml
<ItemGroup>
  <ProjectReference Include="../elura-sdk-csharp/Elura.Transport.Tcp/Elura.Transport.Tcp.csproj" />
</ItemGroup>
```

```csharp
using Elura.Client;

await using var client = await EluraTcpClient.ConnectAsync(
    "gateway.example.com:17000",
    loginTicketFromYourBackend);

var response = await client.RequestAsync(120, applicationPayload);
```

For WebSocket, use `Elura.Transport.WebSocket`. Unity projects can build the
repository and copy only the required .NET Standard 2.1 DLLs into
`Assets/Plugins/Elura/`; see the
[C# SDK README](https://github.com/Arion-Dsh/elura-sdk-csharp#readme) for the
exact assembly list.

## Reconnection and events

The high-level Rust, C++, and C# clients automatically:

1. retain only the newest reconnect ticket;
2. renew it before expiry;
3. reconnect after ordinary transport loss with bounded exponential backoff
   and jitter;
4. publish connection, Push, Session Control, and reauthentication events.

An application request interrupted by transport loss is never replayed
automatically. It fails with the language-specific `RequestInterrupted` error,
so the application can decide whether retrying the operation is safe.

When a reconnect ticket is expired, consumed, or revoked, the client emits
`ReauthenticationRequired`. Obtain a fresh one-time login ticket from the
application login service and pass it to the client's `reauthenticate`
operation. Ordinary network loss does not require an interactive login.

Login and reconnect tickets are credentials. Never write them to logs or
application telemetry.

## ELR2 transport contract

All three SDKs implement the same 28-byte ELR2 header, network byte order,
frame kinds, reserved routes, validation rules, and payload bytes.
Cross-language golden vectors verify byte-for-byte compatibility.

- TCP and reliable QUIC streams contain consecutive ELR2 frames. Use the SDK's
  stream decoder because one read may contain a partial frame or multiple
  frames.
- Each WebSocket binary message contains exactly one ELR2 frame and negotiates
  `elura.v2` as its subprotocol.
- Each UDP, WebTransport Datagram, or QUIC Datagram contains one complete ELR2
  frame.
- Request IDs are non-zero client-generated correlation identifiers. Allocate
  a new request ID for each transport attempt.
- The default payload limit is 1 MiB and the protocol limit is 64 MiB. Send
  large assets through object storage or an application-level chunked upload
  protocol.

See [ELR2 protocol](../concepts/protocol) for the frame layout and reserved
route flows.

## Application messages

The SDKs cover Elura's reserved Gateway routes and wire envelope. Application
routes start at `100`. Define request and response protobuf messages in the
application, generate the normal language-specific protobuf types, and use the
same route ID and schema in server and client builds.

Business operations that require idempotency must carry an application-owned
operation ID. ELR2 request IDs identify transport attempts and are not durable
idempotency keys.

## Upgrade safely

SDKs are standalone versioned dependencies, not generated source inside an
Elura server project. When upgrading:

1. select a compatible SDK release tag or commit from the official GitHub
   repository;
2. review that SDK's release notes and README;
3. rerun its protocol, client, and transport tests;
4. deploy compatible clients before requiring a newer wire protocol.

Elura may change APIs during `0.x`, while the on-wire protocol version remains
explicit.
