# Distributed infrastructure

The generated application starts with in-memory state and DNS discovery. Add
shared adapters only for behaviors that must span processes or survive process
replacement.

## Capability map

| Need | Contract | Available adapter |
| --- | --- | --- |
| Dynamic World targets | `WorldDiscovery` | DNS, Redis, Kubernetes Endpoints |
| World registration | `WorldRegistrar` | Redis |
| Authentication replay protection | `ReplayStore` | Memory, Redis |
| Online session directory | `OnlineDirectory` | Memory, Redis |
| Cross-Gateway push | `PushTransport` | Redis Streams |
| Kick/revoke active sessions | `SessionControlTransport` | Redis Streams |
| Account generation | `AccountVersionStore` | Memory, Redis, SQL |
| Admission/rate/ban state | `AdmissionController` | Redis |
| Player cache invalidation | `InvalidationBus` | Redis |
| Durable event delivery | Outbox contracts | Memory, Redis, SQL |

## Discovery choices

### DNS

DNS discovery periodically resolves a host and port and replaces the target set
for one region, realm, and route. It is simple and matches a Kubernetes headless
Service. It does not provide per-instance metadata beyond resolved addresses.

### Kubernetes Endpoints

The Kubernetes watcher observes endpoint slices and can react directly to
cluster state. Use it when the application has Kubernetes API credentials and
needs richer or faster convergence than DNS.

### Redis

World processes register leases in Redis; Gateways watch the resulting target
set. This fits VM or bare-metal environments without platform-native discovery.
Choose lease and renewal intervals that tolerate brief Redis/network disruption
without keeping failed Worlds routable for too long.

## Distributed sessions

For multiple Gateways, construct a coherent bundle:

```text
RedisOnlineDirectory
        +
RedisSessionControlBus    (required for kick_existing)
        +
RedisStreamPushBus        (for cross-Gateway pushes)
        +
shared ReplayStore        (for horizontally scaled ticket verification)
```

The generated Gateway uses an in-memory replay store. Keep it at one replica
until the application injects a shared replay store; otherwise the same ticket
may be accepted by different replicas.

## Redis Streams

Push and session-control transports use bounded Redis Streams with consumer
groups. Configure unique consumer identities, sensible maximum lengths, idle
claim times, blocking read timeouts, and batch sizes. Monitor pending entries
and delivery failures.

Redis Cluster keys that participate in one atomic operation must use compatible
hash tags and prefixes. Validate the deployment topology instead of assuming
all Redis URLs behave like a single node.

## Outbox

The outbox dispatcher is intentionally not started by Gateway or World
launchers. An application that writes business data and emits events atomically
must construct, run, observe, and shut down its chosen dispatcher explicitly.

## Readiness

Register essential infrastructure with `with_readiness_probe`. A component
should affect readiness when sending new traffic to the process would fail or
violate correctness. Avoid failing liveness for a temporary dependency outage;
that can amplify incidents through restart loops.
