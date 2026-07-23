# Generated project

`elura init all` creates a compilable upper application. Elura supplies
templates, but the generated files belong to your application and are intended
to be edited.

The CLI is optional. See [Manual setup](./manual-setup) to assemble the minimum
Gateway and World application from ordinary Rust files.

```text
.
├── Cargo.toml
├── Dockerfile
├── .dockerignore
├── .gitignore
├── .env.example
├── config
│   ├── README.md
│   ├── elura.env.example
│   ├── application.env.example
│   ├── gateway.json
│   ├── world.json
│   ├── distributed.json
│   └── realm-gateways.json
├── deploy
│   ├── README.md
│   ├── docker-compose.yml
│   └── kubernetes
│       ├── README.md
│       ├── kustomization.yaml
│       ├── namespace.yaml
│       ├── secret.example.yaml
│       ├── discovery-config.yaml
│       ├── gateway.yaml
│       ├── world.yaml
│       └── network-policy.yaml
└── src
    └── bin
        ├── gateway.rs
        └── world.rs
```

## Composition roots

`src/bin/gateway.rs` and `src/bin/world.rs` are composition roots. Each one:

1. Defines the application-owned `AppConfig`.
2. Loads JSON and environment variables.
3. Copies secrets into runtime configuration fields that are skipped by Serde.
4. Constructs the chosen discovery or infrastructure adapter.
5. Registers business routes and starts `Gateway` or `World`.

Elura deliberately does not load configuration on the application’s behalf.
You may replace `AppConfig::load()` with a configuration service, secret
manager, or another file format without changing the runtime.

## Generated defaults

The JSON files contain safe, non-secret development values. Serde uses strict
`deny_unknown_fields` behavior for runtime configurations, so misspelled keys
fail at startup instead of being silently ignored.

Sensitive values are injected through environment variables:

- `APP_TICKET_KEY` signs and verifies single-use login and reconnect tickets.
- `APP_INTERNAL_TOKEN` authenticates Gateway-to-World commands.
- `APP_ADMIN_TOKEN` protects metrics, debug, and mutation endpoints.

The [environment reference](../reference/environment) lists every variable
used by the templates.

Gateway ticket configuration uses `login_ttl` and `reconnect_ttl`. The
application login service calls `issue_login`; successful Gateway
authentication and route `3` responses provide the rotating reconnect ticket.

## Dependencies and features

The generated manifest pins the current Elura release and enables `adapters`
and `monolith`. The split binaries use the adapter layer; the `monolith`
feature keeps the same manifest ready for `elura init monolith`:

```toml
[dependencies]
prost = "0.14"
elura = { version = "0.2.7", features = ["adapters", "monolith"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal"] }
```

Enable only the concrete features the application needs. The `redis` feature
already enables the adapter layer plus Gateway and World. Keep `monolith` only
when the application also builds the single-process binary:

```toml
elura = { version = "0.2.7", features = ["redis"] }
```

See [Crates and feature flags](../reference/crates-and-features) for the full
matrix.
