# World modules and routes

World handlers are the primary extension point for game logic. A handler
receives an authenticated `WorldContext` and a decoded request, then returns a
typed response or an Elura error.

## Define and register a route

An application route binds its stable wire ID, diagnostic name, protobuf request,
and protobuf response in one `Route` implementation:

```rust
use prost::Message;
use elura::prelude::{Route, World, WorldConfig, WorldContext};

#[derive(Clone, PartialEq, Message)]
struct GetPlayerProfileRequest {}

#[derive(Clone, PartialEq, Message)]
struct GetPlayerProfileResponse {
    #[prost(int64, tag = "1")]
    user_id: i64,
    #[prost(string, tag = "2")]
    display_name: String,
}

struct GetPlayerProfile;

impl Route for GetPlayerProfile {
    const ID: u32 = 100;
    const NAME: &'static str = "player.get_profile";

    type Request = GetPlayerProfileRequest;
    type Response = GetPlayerProfileResponse;
}

async fn get_player_profile(
    context: WorldContext,
    _request: GetPlayerProfileRequest,
) -> elura::Result<GetPlayerProfileResponse> {
    Ok(GetPlayerProfileResponse {
        user_id: context.identity.user_id,
        display_name: format!("Player-{}", context.identity.user_id),
    })
}

fn world(config: WorldConfig) -> World {
    World::new(config).route(GetPlayerProfile, get_player_profile)
}
```

Register at least one application route before building a World. Route IDs must
be `100` or greater; IDs and names must both be unique. `World::route` decodes
the request and encodes the successful response with the associated protobuf
types. Fluent registration is intentionally infallible at each call site;
invalid configuration and duplicate routes are reported by `build()` or
`run()`. Use `route_raw` only for low-level integrations that intentionally
handle payload bytes themselves.

## Return business errors

Return an Elura error from the handler instead of encoding an error inside a
successful response:

```rust
if !player.can_afford(item.price) {
    return Err(elura::Error::business(
        "NOT_ENOUGH_GOLD",
        "not enough gold",
    ));
}
```

The Gateway sends this as an ELR2 `Error` frame associated with the original
request ID. Use `Error::retryable(code, message)` only when repeating the same
operation is safe. Unsolicited server-to-client events are `Push` frames, not
error frames.

## Organize modules

`WorldModule` gives a business module a name, registration hook, and optional
asynchronous lifecycle:

```rust
use elura::world::{WorldModule, WorldModuleRegistry};

struct InventoryModule;

impl WorldModule for InventoryModule {
    fn name(&self) -> &str {
        "inventory"
    }

    fn register(&self, world: &mut WorldModuleRegistry<'_>) -> elura::Result<()> {
        // Register inventory handlers and middleware here.
        Ok(())
    }
}
```

Install the module while configuring the World:

```rust
let world = World::new(config).install(InventoryModule);
```

Generate a starting point with:

```bash
elura init module --name inventory
elura init route --module inventory --name equip_item --id 120
```

The application remains responsible for including generated modules and
protobuf compilation in its build.

## Context and middleware

`WorldContext` carries request-scoped data such as identity, session ID, trace
ID, request ID, ownership, and push access. Middleware can implement logging,
transactions, player-state loading, authorization, or domain-specific policy.

Keep middleware responsibilities narrow. A common order is:

1. Trace and structured logging.
2. Authorization and ownership checks.
3. Player-state cache/load.
4. Unit of work or transaction.
5. Typed business handler.

Return retryable failures only when repeating the same request is safe. Reuse
the request ID so idempotency protection can recognize the retry.

## Business testing

Build the fluent World and use the harness returned by `WorldServer::harness()`
for handler-level and multi-step business tests without opening sockets:

```rust
use elura::world::testing::test_identity;

let harness = World::new(WorldConfig::default())
    .route(GetPlayerProfile, get_player_profile)
    .build()?
    .harness();

let client = harness.client(test_identity(42))?;
let response = client
    .call(GetPlayerProfile, GetPlayerProfileRequest {})
    .await?;
assert_eq!(response.user_id, 42);
```

`WorldHarness` is exported from `elura::world::testing`. `WorldTestClient`
keeps one identity and session across calls, automatically assigns request IDs,
and encodes and decodes typed route messages. This makes a sequence such as
login, list inventory, equip item, and read the updated player state a normal
Rust test. Use `call_in_session` when the test must supply a session ID and
`command_raw` only for protocol and malformed-payload cases. Cover:

- valid and invalid protobuf payloads;
- identity/realm authorization;
- duplicate request IDs;
- timeout and retryable error behavior;
- transaction rollback;
- expected push messages.

### Transport-selectable full-stack tests

Add `elura-testkit` as a development dependency when p99 must include the
client transport, ticket authentication, Gateway queues, the Gateway-to-World
connection pool, and World execution:

```toml
[dev-dependencies]
elura-testkit = "0.3.1"
```

```rust
use elura_testkit::{
    FullStackBuilder, FullStackLoadConfig, WebSocketTestTransport,
    test_identity,
};

let harness = FullStackBuilder::loopback()?
    .route(GetPlayerProfile, get_player_profile)
    .start(WebSocketTestTransport::loopback()?)
    .await?;

let report = harness
    .load_scenario(
        FullStackLoadConfig::new(32, 1_000),
        |worker| test_identity(worker as i64 + 1),
        |client, _, _| async move {
            client.call(GetPlayerProfile, GetPlayerProfileRequest {}).await?;
            Ok(())
        },
    )
    .await?;

println!("transport={} p99={:?}", report.transport, report.operation_latency.p99);
harness.shutdown().await?;
```

Built-in TCP and WebSocket connectors use the same business client. The
`TestTransport` and `TestConnection` traits allow QUIC, WebTransport, UDP, and
application-specific transports to supply matching Gateway and client sides.
Never combine samples from different transports into one percentile. Local
loopback results are full software-stack baselines; production network p99
still requires a separate load process against the deployed environment.

`WorldHarness` intentionally exposes no load or percentile API. It bypasses
Gateway and transport processing, so its timings are useful for unit-test
diagnostics but are not a valid full-stack p99.

Run the workspace verification before publishing application changes:

```bash
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```
