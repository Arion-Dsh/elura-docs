# Environment variables

These names belong to the generated upper application. Elura itself does not
read environment variables.

## Secrets

| Variable | Required by | Description |
| --- | --- | --- |
| `APP_TICKET_KEY` | Gateway, monolith | Ticket signing/verification key; at least 32 bytes |
| `APP_INTERNAL_TOKEN` | Split Gateway and World | Private command authentication; at least 32 bytes and different from ticket key |
| `APP_ADMIN_TOKEN` | Non-loopback admin listener | Bearer token for metrics/debug/admin; at least 32 bytes |

## Configuration paths

| Variable | Default |
| --- | --- |
| `APP_GATEWAY_CONFIG` | `config/gateway.json` |
| `APP_WORLD_CONFIG` | `config/world.json` |
| `APP_MONOLITH_CONFIG` | `config/monolith.json` |

## Listener overrides

| Variable | Example |
| --- | --- |
| `APP_GATEWAY_ADDR` | `0.0.0.0:17000` |
| `APP_GATEWAY_ADMIN_ADDR` | `0.0.0.0:17001` |
| `APP_WORLD_LISTEN` | `0.0.0.0:18000` |
| `APP_WORLD_ADMIN_ADDR` | `0.0.0.0:18001` |
| `APP_INSTANCE_ID` | Pod name or stable process identifier |

## Deployment and application examples

| Variable | Purpose |
| --- | --- |
| `ELURA_IMAGE` | Docker Compose image override; defaults to `elura-game:dev` |
| `DATABASE_URL` | Reserved example for application persistence |
| `ACCOUNT_SERVICE_URL` | Reserved example for an account service |
| `CHARACTER_SERVICE_URL` | Reserved example for a character service |
| `APP_REDIS_CLUSTER_NODES` | Example application-owned Redis seed list |

The generated binaries do not read the reserved business/adapter examples
until the application adds them to `AppConfig`.

## Shell usage

```bash
set -a
. config/elura.env
set +a
cargo run --bin gateway
```

In production, inject secrets using the platform’s secret mechanism. Avoid
putting values directly in command arguments, images, ConfigMaps, or source
control.
