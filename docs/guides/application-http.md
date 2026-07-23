# Application HTTP services

`Gateway::http(...)` and `World::http(...)` attach application-owned Axum
routers to the Elura lifecycle. Use them for login endpoints, provider
callbacks, webhooks, internal APIs, or game REST APIs.

Application HTTP is not an ELR2 [client transport](./transports), and it is not
the private admin server created by `.run(AdminServerConfig)`. The three
surfaces have separate listeners and security policy.

| Surface | Assembly API | Purpose |
| --- | --- | --- |
| Application HTTP | `Gateway::http(...)` / `World::http(...)` | Application routes and callbacks |
| Client transport | `Gateway::transport(...)` | ELR2 game sessions |
| Admin HTTP | `.run(AdminServerConfig)` | `/healthz`, `/readyz`, `/elura/metrics`, diagnostics, mutations |

## Add an Axum Router

Add Axum to the upper application:

```toml
[dependencies]
axum = "0.8"
elura = "0.2.8"
```

Build an ordinary Axum `Router`, then give it a dedicated listener with
`.http(...)`:

```rust
use axum::{Json, Router, routing::get};
use serde_json::{Value, json};

async fn application_status() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

fn application_router() -> Router {
    Router::new().route("/elura/status", get(application_status))
}

let tcp = TcpTransport::new(tcp_config)?;
Gateway::new(gateway_config)
    .transport(tcp)
    .world_discovery(discovery)
    .http("127.0.0.1:19000", application_router())
    .run(admin_config)
    .await?;
```

The Router is application-owned. Add Axum state, middleware, authentication,
CORS, request limits, and tracing exactly as in any other Axum application.
Elura does not automatically protect application HTTP routes with the admin
bearer token.

Multiple `.http(...)` calls are allowed when the application needs independent
routers or listeners.

## One login for HTTP and realtime

`HttpAuthApi` provides a common login surface without replacing the stateful
ELR2 connection:

| Endpoint | Credential | Purpose |
| --- | --- | --- |
| `POST /elura/auth/login` | Provider-specific JSON credential | Issue HTTP access and refresh tokens; optionally issue the first Gateway ticket |
| `POST /elura/auth/refresh` | Single-use refresh token | Rotate the refresh token and issue a new access token |
| `POST /elura/game/session-ticket` | HTTP bearer access token | Exchange an authenticated account and player selection for a short-lived, single-use Gateway login ticket |

The access token is reusable for ordinary HTTP APIs. Protect only routes that
need it by applying `require_bearer`; public callbacks and status routes can
remain outside that middleware:

```rust
let payments = Router::new()
    .route("/elura/payments/orders", post(create_order))
    .route_layer(middleware::from_fn_with_state(
        auth_api.bearer_auth(),
        require_bearer,
    ));

let public_http = auth_api.router().merge(payments);

Gateway::new(gateway_config)
    .transport(TcpTransport::new(tcp_config)?)
    .http("0.0.0.0:8080", public_http)
    .run(admin_config)
    .await?;
```

Payment and other protected handlers extract `AuthenticatedHttp` and call
`require_scope(...)` for business permissions. They do not inspect the ELR2
Session. Conversely, the long-lived connection authenticates with the
one-time Gateway login ticket and later reconnect tickets; it does not send the
HTTP access token on every ELR2 request.

Applications with a custom identity system implement `HttpLoginBackend`.
When `gateway` and `identity` are both enabled, `IdentityHttpBackend` connects
the built-in `IdentityService` and password, phone, OAuth2, WeChat, Douyin, or
QuickSDK providers to `HttpAuthApi`. The application implements only
`IdentityHttpPolicy` to grant scopes and verify that a selected player belongs
to the authenticated account. Registration and account linking remain explicit
flows so a one-time third-party authorization code is never consumed twice.

For multiple HTTP or Gateway replicas, use the same token signing
issuer/audience/key configuration on every instance and a shared `ReplayStore`
such as Redis. Any HTTP replica can then validate an access token, while refresh
rotation and Gateway tickets remain single-use across the cluster. A load
balancer may send successive HTTP requests to different replicas; WebSocket and
WebTransport connections remain attached to the replica that accepted the
connection until reconnect.

## Expose online totals

An application Router can hold the statistics capability without depending on
the concrete Redis Adapter:

```rust
use std::sync::Arc;

use axum::{extract::{Path, State}, Json};
use elura::prelude::{OnlineStats, OnlineStatsReader};

#[derive(Clone)]
struct OnlineApi {
    stats: Arc<dyn OnlineStatsReader>,
}

async fn online_totals(
    State(api): State<OnlineApi>,
    Path((region_id, realm_id)): Path<(u32, u32)>,
) -> Result<Json<OnlineStats>, ApplicationHttpError> {
    Ok(Json(api.stats.stats(region_id, realm_id).await?))
}
```

Use `OnlineStats::user_count` for distinct players and `session_count` for
authenticated connections. Keep authorization, caching, public count rounding,
and bot filtering in the application. See the
[online presence API](/adapters/online).

## HTTP beside a World

A standalone World can supervise application HTTP on another port. This is
useful for private service callbacks or application APIs that must run beside
game state:

```rust
World::new(world_config)
    .route(GetPlayerProfile, get_player_profile)
    .http("127.0.0.1:19001", application_router())
    .run(admin_config)
    .await?;
```

## HTTP in a monolith

Enable the `monolith` feature:

```toml
elura = { version = "0.2.8", features = ["monolith"] }
```

Use `Monolith::gateway` and `Monolith::world` when the combined process needs
HTTP owned by either side:

```rust
Monolith::new(gateway_config, world_config)
    .transport(TcpTransport::new(tcp_config)?)
    .route(GetPlayerProfile, get_player_profile)
    .gateway(|gateway| {
        gateway.http("127.0.0.1:19000", public_router())
    })
    .world(|world| {
        world.http("127.0.0.1:19001", private_router())
    })
    .run(admin_config)
    .await?;
```

Every application HTTP server is supervised by the same lifecycle as its
Gateway or World and receives graceful shutdown. A bind or serve failure stops
the composed process and is returned to the application.

## Listener and security rules

- Application HTTP, client transport, admin HTTP, and standalone World
  listeners must use non-conflicting addresses. An unspecified address such as
  `0.0.0.0:19000` conflicts with every listener on port `19000`.
- Invalid addresses and listener conflicts are returned by `build()` or
  `run()`; fluent registration does not panic.
- Keep admin HTTP private. Do not re-export `/elura/admin`,
  `/elura/debug`, or `/elura/metrics` through the public application Router.
- Configure authentication, CORS, body limits, timeouts, and proxy trust for
  application HTTP explicitly.
- The `.http(...)` helper serves plain HTTP. Place it behind a trusted
  TLS-terminating proxy, or run an application-owned HTTPS server when direct
  TLS termination is required.
