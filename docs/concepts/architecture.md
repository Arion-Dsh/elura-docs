# Architecture

Elura separates public client transport from private game execution. A Gateway
owns connections and sessions; a World owns business handlers and game state.

```text
                 public network                 private network

 Client ── ELR2/TCP, WebSocket, or QUIC ──> Gateway ── ELR2/TCP ──> World
                                      │   │                     │
                                      │   ├── discovery         ├── handlers
                                      │   ├── session state     ├── middleware
                                      │   └── admission         └── persistence
                                      │
                                      └── admin HTTP

 Shared infrastructure (optional): Redis, SQL, Kubernetes API, DNS
```

## Gateway responsibilities

The Gateway is the trust and connection boundary. It:

- accepts TCP, WebSocket, QUIC, or application-defined client transports;
- enforces connection, payload, queue, timeout, and rate limits;
- validates authentication and reconnect tickets;
- issues and rotates reconnect tickets for authenticated sessions;
- maintains session state and heartbeats;
- resolves a World target by region, realm, route, and optional ownership;
- forwards commands and returns responses;
- delivers pushes to connected sessions;
- exposes health, readiness, metrics, diagnostics, and optional admin controls.

Gateways should remain largely stateless when scaled horizontally. Any state
that must survive a process or be visible across Gateways—ticket replay,
presence, push, session control, admission, and account versions—needs an
explicit shared adapter.

The application login service owns credential authentication, account binding,
region/realm selection, durable refresh sessions, and calls
`TicketService::issue_login`. Gateway owns only the short-lived, single-use
connection credentials and their replay protection. Refresh tokens and device
login sessions do not belong in Gateway.

## World responsibilities

The World is the private business execution boundary. It:

- accepts authenticated commands from Gateways;
- validates route IDs and transport metadata;
- limits connections and in-flight commands;
- runs middleware and typed handlers;
- makes identity, trace, session, and push context available to handlers;
- registers with discovery when a registrar is configured;
- reports runtime diagnostics through its admin server.

The generated split application uses an internal bearer token. In a production
network, combine that token with network policy and, where appropriate, TLS or
mTLS.

## Runtime and application layers

Elura uses dependency inversion at infrastructure boundaries:

| Runtime contract | Example implementation |
| --- | --- |
| `WorldDiscovery` | DNS, Redis, Kubernetes Endpoints |
| `WorldRegistrar` | Redis registration |
| `ReplayStore` | Memory or Redis |
| `OnlineDirectory` | Memory or Redis Session-lease lifecycle |
| `OnlineStatsReader` | Memory or Redis online aggregation |
| `OnlineBackend` | Any Adapter implementing both online contracts |
| `PushTransport` | In-process or Redis Streams |
| `SessionControlTransport` | Redis Streams |
| `AccountVersionStore` | Memory, Redis, or SQL |
| `AdmissionController` | Redis admission policy |

The application constructs these components explicitly. Gateway-wide services
can be grouped with `GatewayInfrastructure`, while the application-facing
`Gateway` and `World` types expose fluent methods such as `world_discovery`,
`replay_store`, `push_transport`, `registrar`, `route`, and `middleware`.
Configuration and duplicate-registration errors are retained by the fluent API
and returned by `build()` or `run()`. Elura never guesses which adapter or
provider to use.

The documentation follows the same boundary: [Adapters](/adapters/) catalog
infrastructure implementations, [Providers](/providers/) catalog external
business integrations, and [Guides](/guides/world-development) explain how to
use both without merging their responsibilities.

## Monolith versus split runtime

`Monolith` keeps the same Gateway and World concepts but connects them
in-process. This removes private network and discovery concerns and is ideal for
local development. A split deployment validates the real connection pooling,
timeouts, authentication, discovery, and failure behavior used in production.

## Failure boundaries

- A client protocol error closes or rejects the affected session rather than
stopping the process.
- Handler panics are recovered and counted as World failures.
- Timeouts and bounded queues prevent unbounded work accumulation.
- Gateway backend protection can cap concurrent World work and open a circuit
after transient failures.
- Graceful shutdown stops accepting new work and drains existing tasks within
configured timeouts.
