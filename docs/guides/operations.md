# Observability and operations

Calling `run(AdminServerConfig)` on `Gateway`, `World`, or `Monolith` starts a
private HTTP admin server alongside the game service. Separate ports keep
operational traffic out of the ELR2 protocol path.

## Probe endpoints

| Endpoint | Authentication | Success | Meaning |
| --- | --- | --- | --- |
| `GET /elura/healthz` | None | `204` | Process and admin loop are alive |
| `GET /elura/readyz` | None | `204` | Process can accept new traffic |
| `GET /elura/version` | None | `200` JSON | Elura version, runtime, component, instance |

A failed readiness check returns `503` with a short reason. Use readiness to
remove the process from traffic; use liveness only to recover a process that is
actually stuck.

## Metrics and diagnostics

Metrics and debug endpoints require a bearer token when one is configured:

```bash
curl -H "Authorization: Bearer $APP_ADMIN_TOKEN" \
  http://127.0.0.1:17001/elura/metrics
```

| Endpoint | Purpose |
| --- | --- |
| `GET /elura/metrics` | Prometheus text exposition |
| `GET /elura/debug/stats` | Runtime counters and current activity |
| `GET /elura/debug/backend` | Gateway circuit/concurrency state; may return `404` |
| `GET /elura/debug/routes` | Registered World route metadata; may return `404` |

All JSON/debug responses use `Cache-Control: no-store`.

## Important Gateway signals

- active versus total connections;
- authenticated sessions;
- requests and rejected requests;
- failures, pushes, and push failures;
- active World commands;
- concurrency and circuit-breaker rejections;
- transient backend failures and circuit openings.

`elura_gateway_sessions_authenticated` is a per-Gateway Session gauge. Sum it
across replicas for operational connection load, but do not present that sum as
distinct players. Player-facing totals come from
`OnlineStatsReader::stats(region_id, realm_id)`, whose `user_count`
deduplicates by `user_id`. See [Online presence](/adapters/online).

## Important World signals

- active versus total commands;
- successful commands;
- business and internal failures;
- timeouts and recovered handler panics;
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

The application-facing `run` methods listen for platform shutdown signals,
stop accepting work, and coordinate Gateway/World/admin tasks. Kubernetes should provide a
termination grace period longer than the configured shutdown timeout and enough
time for endpoint removal. A short `preStop` delay can reduce new connections
during endpoint propagation.

## Load testing

Use `elura-testkit` for a local full software-stack p99 with a selected client
transport, real Gateway authentication and queues, and the Gateway-to-World
connection pool. Keep each transport's samples in a separate report. Use
`WorldHarness` only for deterministic handler and multi-step business unit
tests; it deliberately has no load or percentile API.

Measure deployed application capacity from a separate load process using the
application's own load-testing platform and production-shaped business
scenarios. Keep reports from different transports separate.

The source workspace also contains `elura-load` and `elura-perf`. They are
`publish = false` framework-maintainer tools for Elura's own performance
regression testing, not application dependencies or supported upper-layer APIs.
See [Framework performance regression](../contributing#framework-performance-regression).

## Incident checks

1. Check `/elura/healthz`, `/elura/readyz`, and `/elura/version` on the affected instance.
2. Capture `/elura/debug/stats` and `/elura/debug/backend` before restarting it.
3. Compare Gateway backend errors with World command failures and latency.
4. Verify discovery targets and World readiness.
5. Check Redis/SQL/Kubernetes adapter health separately.
6. For stale presence, compare the application projection with live
   `OnlineDirectory` leases and verify Redis TTL/renewal behavior.
7. Confirm a rollout did not change route IDs, secrets, issuer/audience, TLS, or
internal tokens incompatibly.
