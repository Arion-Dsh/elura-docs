# Production checklist

Use this list as a release gate, adapting it to the application’s threat model
and availability requirements.

## Protocol and application

- [ ]  Route IDs are unique, stable, and `>= 100`.
- [ ]  Protobuf changes are backward compatible across the rollout window.
- [ ]  Client retries reuse request IDs and have bounded exponential backoff.
- [ ]  Handler timeouts, idempotency, and transaction behavior are tested.
- [ ]  Load tests cover expected concurrency, payloads, reconnects, and pushes.

## Secrets and network

- [ ]  Ticket key, internal token, and admin token are unique values of at least 32 bytes.
- [ ]  Secret rotation and rollback procedures are documented.
- [ ]  Only the Gateway client listener is public.
- [ ]  World and admin listeners are isolated by firewall/NetworkPolicy.
- [ ]  Public TLS and internal TLS/mTLS match the threat model.
- [ ]  Proxy Protocol trusts only known load-balancer CIDRs.

## Distributed correctness

- [ ]  Multiple Gateways share a replay store.
- [ ]  Duplicate-login policy has the required online and session-control transports.
- [ ]  Online dashboards distinguish authenticated Sessions from users deduplicated by `user_id`.
- [ ]  Durable presence projections reconcile against lease expiry instead of relying only on `SessionObserver`.
- [ ]  Cross-Gateway push is configured when business logic requires it.
- [ ]  Discovery removes unready/terminated Worlds promptly.
- [ ]  Stateful Worlds use an ownership and epoch strategy.
- [ ]  Redis Cluster key prefixes/hash tags are compatible with required operations.
- [ ]  Outbox dispatchers run, drain, retry, and expose health independently.

## Capacity and resilience

- [ ]  Gateway connection, per-IP, queue, rate, payload, and timeout limits are tuned.
- [ ]  World connection and in-flight limits match Gateway pool capacity.
- [ ]  Circuit-breaker thresholds are exercised in failure tests.
- [ ]  Resource requests/limits and autoscaling signals are based on load tests.
- [ ]  Termination grace periods exceed drain/shutdown timeouts.
- [ ]  PodDisruptionBudgets match the actual replica count.

## Realtime simulation

- [ ]  Input target-Tick, redundancy, reorder, and replay windows are bounded and tested.
- [ ]  Scene ownership prevents the same logical match from simulating on two Worlds.
- [ ]  Fixed-step catch-up limits and overload behavior are explicit.
- [ ]  AOI and replication streams are partitioned by observer and scene rather than globally.
- [ ]  Prediction, interpolation, replication, and rewind capacities are sized from measured RTT and jitter.
- [ ]  Prediction and lag-compensation snapshots contain only simulation or collision data.
- [ ]  Weak-network tests cover loss, jitter, reordering, duplication, queue pressure, and constrained bandwidth.
- [ ]  Historical hit validation cannot mutate live state before the result is accepted.

## Operations

- [ ]  Health/readiness/version endpoints are monitored.
- [ ]  Prometheus metrics are scraped with admin authentication where required.
- [ ]  Alerts cover readiness, failure rates, saturation, and open circuits.
- [ ]  Logs include trace, request, route, session, and instance identifiers without secrets.
- [ ]  Admin mutations are available only through an audited operator path.
- [ ]  Dashboards and incident runbooks have been validated in a game-day exercise.
