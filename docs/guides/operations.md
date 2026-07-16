# Observability and operations

Every standard launcher starts a private HTTP admin server alongside the game
service. Separate ports keep operational traffic out of the ELR2 protocol path.

## Probe endpoints

| Endpoint | Authentication | Success | Meaning |
| --- | --- | --- | --- |
| `GET /healthz` | None | `204` | Process and admin loop are alive |
| `GET /readyz` | None | `204` | Process can accept new traffic |
| `GET /version` | None | `200` JSON | Elura version, runtime, component, instance |

A failed readiness check returns `503` with a short reason. Use readiness to
remove the process from traffic; use liveness only to recover a process that is
actually stuck.

## Metrics and diagnostics

Metrics and debug endpoints require a bearer token when one is configured:

```bash
curl -H "Authorization: Bearer $APP_ADMIN_TOKEN" \
  http://127.0.0.1:17001/metrics
```

| Endpoint | Purpose |
| --- | --- |
| `GET /metrics` | Prometheus text exposition |
| `GET /debug/stats` | Runtime counters and current activity |
| `GET /debug/backend` | Gateway circuit/concurrency state; may return `404` |
| `GET /debug/routes` | Registered World route metadata; may return `404` |

All JSON/debug responses use `Cache-Control: no-store`.

## Important Gateway signals

- active versus total connections;
- authenticated sessions;
- requests and rejected requests;
- failures, pushes, and push failures;
- active World commands;
- concurrency and circuit-breaker rejections;
- transient backend failures and circuit openings.

## Important World signals

- active versus total commands;
- successful commands;
- business and internal failures;
- timeouts and recovered handler panics;
- idempotency cache activity;
- route readiness and registrar health.

Alert on rates and sustained states, not isolated increments. A circuit that
remains open, continuously rising internal failures, or readiness failures
across all instances needs immediate attention.

## Administrative mutations

When the application attaches Gateway admin services, operators can force a
logout, revoke account generations, ban users or IPs, and enable maintenance
mode. Admission mutation routes additionally require an `AdmissionAdmin`
implementation. Missing optional capabilities return `404`.

The [Admin HTTP API](../reference/admin-api) documents request bodies and
status codes.

## Graceful shutdown

Standard launchers listen for platform shutdown signals, stop accepting work,
and coordinate Gateway/World/admin tasks. Kubernetes should provide a
termination grace period longer than the configured shutdown timeout and enough
time for endpoint removal. A short `preStop` delay can reduce new connections
during endpoint propagation.

## Load testing

The workspace includes `elura-load`, a TCP load generator that creates signed
test tickets, authenticates every connection, sends an application route, and
reports connection, authentication, request latency, throughput, and error
counts.

```bash
export ELURA_LOAD_TICKET_KEY='replace-with-the-same-32-byte-gateway-key'
cargo run -p elura-load -- \
  --address 127.0.0.1:17000 \
  --connections 1000 \
  --requests 100 \
  --route 120
```

Run `cargo run -p elura-load -- --help` for payload, timeout, ramp, identity,
and ticket claim options. The ticket key, issuer, audience, region, and realm
must match the target Gateway. Use a dedicated non-production environment;
every worker represents an authenticated user and invokes the selected route.

For repeatable distributed tests, `tools/elura-perf/compose.yml` starts HAProxy,
two Gateways, one World, Redis, and the load generator. Its configuration
deliberately disables the shared per-source-IP request limit because all load
connections originate from one container. Do not copy that override into
normal deployment settings.

## Incident checks

1. Check `/healthz`, `/readyz`, and `/version` on the affected instance.
2. Capture `/debug/stats` and `/debug/backend` before restarting it.
3. Compare Gateway backend errors with World command failures and latency.
4. Verify discovery targets and World readiness.
5. Check Redis/SQL/Kubernetes adapter health separately.
6. Confirm a rollout did not change route IDs, secrets, issuer/audience, TLS, or
internal tokens incompatibly.
