# Architecture

Elura separates public client transport from private game execution. A Gateway
owns connections and sessions; a World owns business handlers and game state.

```text
                 public network                 private network

 Client ── ELR2/TCP or WebSocket ──> Gateway ── ELR2/TCP ──> World
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

- accepts TCP or WebSocket clients;
- enforces connection, payload, queue, timeout, and rate limits;
- validates authentication and reconnect tickets;
- maintains session state and heartbeats;
- resolves a World target by region, realm, route, and optional ownership;
- forwards commands and returns responses;
- delivers pushes to connected sessions;
- exposes health, readiness, metrics, diagnostics, and optional admin controls.

Gateways should remain largely stateless when scaled horizontally. Any state
that must survive a process or be visible across Gateways—ticket replay,
presence, push, session control, admission, and account versions—needs an
explicit shared adapter.

## World responsibilities

The World is the private business execution boundary. It:

- accepts authenticated commands from Gateways;
- validates route IDs and transport metadata;
- limits connections and in-flight commands;
- applies idempotency protection;
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
| `OnlineDirectory` | Memory or Redis |
| `PushTransport` | In-process or Redis Streams |
| `SessionControlTransport` | Redis Streams |
| `AccountVersionStore` | Memory, Redis, or SQL |
| `AdmissionController` | Redis admission policy |

The application constructs these components explicitly. Gateway-wide services
can be grouped with `GatewayInfrastructure`; `WorldLauncher` exposes focused
methods such as `with_push_transport` and `with_registrar`, while
`WorldBuilder` owns routes and middleware. The launcher never guesses which
provider to use.

## Monolith versus split runtime

`MonolithLauncher` keeps the same Gateway and World concepts but connects them
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
