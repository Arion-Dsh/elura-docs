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

## Testing

Build the fluent World and use the harness returned by `WorldServer::harness()`
for handler-level tests without opening sockets:

```rust
let harness = World::new(WorldConfig::default())
    .route(GetPlayerProfile, get_player_profile)
    .build()?
    .harness();
```

Its concrete type is `elura::world::testing::WorldHarness`. The typed
`call(route, identity, request)` helper encodes the request and decodes the
response. Cover:

- valid and invalid protobuf payloads;
- identity/realm authorization;
- duplicate request IDs;
- timeout and retryable error behavior;
- transaction rollback;
- expected push messages.

Run the workspace verification before publishing application changes:

```bash
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```
