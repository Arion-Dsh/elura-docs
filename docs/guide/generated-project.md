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
5. Registers business routes and starts the launcher.

Elura deliberately does not load configuration on the application’s behalf.
You may replace `AppConfig::load()` with a configuration service, secret
manager, or another file format without changing the runtime.

## Generated defaults

The JSON files contain safe, non-secret development values. Serde uses strict
`deny_unknown_fields` behavior for runtime configurations, so misspelled keys
fail at startup instead of being silently ignored.

Sensitive values are injected through environment variables:

- `APP_TICKET_KEY` signs and verifies client authentication tickets.
- `APP_INTERNAL_TOKEN` authenticates Gateway-to-World commands.
- `APP_ADMIN_TOKEN` protects metrics, debug, and mutation endpoints.

The [environment reference](../reference/environment) lists every variable
used by the templates.

## Dependencies and features

The generated manifest starts with the `adapters` feature:

```toml
[dependencies]
prost = "0.14"
elura = { version = "0.1.1", features = ["adapters"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal"] }
```

Enable only the concrete features the application needs. For example, Redis
requires both the facade’s adapter layer and the `redis` feature:

```toml
elura = { version = "0.1.1", features = ["redis"] }
```

See [Crates and feature flags](../reference/crates-and-features) for the full
matrix.
