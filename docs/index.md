---
layout: home

hero:
  text: Run the world behind your game.
  tagline: A Rust server framework with typed game logic, resilient networking, and infrastructure that scales only when you need it.
  actions:
    - theme: brand
      text: Build your first server
      link: /guide/quick-start
    - theme: alt
      text: Explore the architecture
      link: /concepts/architecture

features:
  - icon: "01"
    title: From zero to a live server
    details: Generate an editable Rust application, local configuration, containers, and deployment manifests in one command.
    link: /guide/quick-start
    linkText: Start building
  - icon: "02"
    title: Typed from wire to handler
    details: Use ELR2 framing, generated client SDKs, protobuf messages, typed handlers, and explicit middleware.
    link: /guides/world-development
    linkText: Write game logic
  - icon: "03"
    title: Scale without a rewrite
    details: Add Redis, SQL, DNS, Kubernetes, metrics, protection, and horizontal routing while keeping the same application boundary.
    link: /guides/deployment
    linkText: Design for production
  - icon: "04"
    title: Authoritative realtime gameplay
    details: Compose fixed ticks, rooms, AOI, replication, prediction, interpolation, lag compensation, and reproducible weak-network tests.
    link: /guides/realtime-gameplay
    linkText: Build realtime systems
---

## Start with a generated application

You do not need to understand every Elura crate before running a server. Generate
an application first, then learn each piece while changing real code:

```bash
cargo install elura-cli
mkdir my-game && cd my-game
elura init all --dir .
```

The generator creates editable application code, local configuration, Docker
files, and Kubernetes manifests. Continue with the
[10-minute quick start](/guide/quick-start) to configure development secrets and
launch both processes.

## The mental model

```text
Player client ──> Gateway ──> World ──> your typed handler
                  sessions     routing   game rules
```

- **Gateway** owns public connections, authentication, sessions, and routing.
- **World** executes authenticated game commands and middleware.
- **Your application** owns routes, game rules, configuration, persistence, and
  deployment choices.

That separation stays the same whether you run locally, as a monolith, or across
multiple Kubernetes nodes. [Read the architecture overview](/concepts/architecture)
when you want the full picture.

## Choose your next step

| I want to… | Go to… |
| --- | --- |
| Run Elura for the first time | [Quick start](/guide/quick-start) |
| Run Gateway and World in one process without the CLI | [Manual single-process setup](/guide/manual-monolith) |
| Build separate Gateway and World processes without the CLI | [Manual split setup](/guide/manual-setup) |
| Assemble shared state and dynamic discovery | [Manual distributed setup](/guide/manual-distributed) |
| Add my first game command | [World modules and routes](/guides/world-development) |
| Build realtime rooms, AOI, prediction, or entity replication | [Realtime gameplay](/guides/realtime-gameplay) |
| Add TCP, UDP, WebSocket, WebTransport, QUIC, or a custom client endpoint | [Client transports](/guides/transports) |
| Add an Axum HTTP API or callback endpoint | [Application HTTP services](/guides/application-http) |
| Connect a Rust, C++, C#, or TypeScript client | [Client protocol SDKs](/guides/client-sdks) |
| Understand generated files | [Generated project](/guide/generated-project) |
| Choose Redis, SQL, DNS, Kubernetes, or a custom backend | [Adapters](/adapters/) |
| Add login, OTP, SMS, or payments | [Providers](/providers/) |
| Prepare a production release | [Production checklist](/reference/production-checklist) |

::: info Project status
The current release is **v0.2.8**. It adds one-login HTTP access/refresh
authentication with one-time Gateway ticket exchange, a built-in
`IdentityService` bridge, and standalone Rust client SDK generation alongside
C++, C#, and TypeScript. Public framework routes consistently use
`/elura/...`; Kubernetes-compatible liveness and readiness probes remain at
`/healthz` and `/readyz`. The project remains pre-1.0: pin exact versions in
production and review release notes and compatibility before upgrading.
:::
