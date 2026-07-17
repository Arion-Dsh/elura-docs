---
outline: [2, 3]
---

# Discovery adapters

`WorldDiscovery` feeds routable World targets into Gateways.
`WorldRegistrar` lets a World publish a renewable lease. Discovery is control
plane state; Gateway requests still use direct ELR2 connections to the selected
World.

## DNS

`DnsWorldDiscovery` periodically resolves the `host:port` in
`DnsWorldDiscoveryConfig` and replaces the target set for one region, realm, and
route. It needs only the `adapters` feature.

Choose DNS for stable service names and Kubernetes headless Services. It is
simple but exposes no per-instance metadata beyond resolved addresses.

## Redis registration and discovery

`RedisWorldRegistrar` publishes expiring `WorldRegistration` leases;
`RedisWorldDiscovery` scans and watches the same prefix. Enable `redis` and use
matching `RedisWorldRegistrationConfig.key_prefix` and
`RedisWorldDiscoveryConfig.key_prefix`.

The registration TTL must be at least twice the renewal interval. Every World
needs a unique ID and an address reachable from all Gateways. Standalone and
Cluster constructors are available where supported.

## Kubernetes Endpoints

`EndpointDiscovery` performs a one-shot EndpointSlice resolution.
`EndpointWatcher` continuously watches slices and updates routes;
`KubernetesWorldDiscovery` wraps that watcher as the higher-level Gateway
integration. Enable `kubernetes` and grant the process read/watch access only to
the required namespace and resources.

Choose the Kubernetes watcher when API-driven convergence or endpoint metadata
is worth the additional credentials and control-plane dependency.

## Choosing

| Environment | Usually start with |
| --- | --- |
| Single process or fixed targets | Static application configuration |
| VM/bare metal with service DNS | DNS |
| VM/bare metal needing per-World leases | Redis registration/discovery |
| Kubernetes with simple service routing | DNS/headless Service |
| Kubernetes needing direct EndpointSlice updates | Kubernetes watcher |

Applications may implement `WorldDiscovery` and `WorldRegistrar` for Consul,
etcd, a platform control plane, or another registry.

## Example: DNS discovery

```rust
use std::sync::Arc;

use elura::adapters::discovery::{DnsWorldDiscovery, DnsWorldDiscoveryConfig};
use elura::prelude::*;

let config = DnsWorldDiscoveryConfig::new("world.internal:18000", 1, 1);
let discovery = Arc::new(DnsWorldDiscovery::new(config)?);

let gateway = Gateway::new(gateway_config).world_discovery(discovery);
```

Replace only `discovery` when moving to Redis or Kubernetes; ELR2 routing and
game handlers do not change.
