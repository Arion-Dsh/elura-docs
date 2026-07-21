---
outline: [2, 3]
---

# Kubernetes adapters

Enable `kubernetes` only for processes that talk to the Kubernetes API. Prefer
DNS when a Service already supplies sufficient discovery and no controller
behavior is required.

## Endpoint discovery

`EndpointWatcher` observes EndpointSlices according to `EndpointWatcherConfig`.
`EndpointDiscovery` converts snapshots into World targets, while
`KubernetesWorldDiscovery` integrates the watcher with Gateway routing.

Grant read/watch permissions only for the target namespace and EndpointSlice
resources. Monitor `EndpointWatcherStats` and retain the last known good target
set during transient API failures.

### Usage example

```rust
use std::sync::Arc;

use elura::adapters::discovery::KubernetesWorldDiscovery;
use elura::adapters::kubernetes::EndpointWatcherConfig;
use elura::prelude::*;

let config = EndpointWatcherConfig::new("game", "world", "elr2", 1, 1);
let discovery = Arc::new(KubernetesWorldDiscovery::new(config)?);
let gateway = Gateway::new(gateway_config).world_discovery(discovery);
```

The Service port must be named `elr2` in this example, and the Gateway service
account needs EndpointSlice read/watch permission in namespace `game`.

## Leader election

`run_leader_elected` and `LeaderElectionConfig` use Kubernetes Leases to run one
active task across replicas. Treat `LeadershipError` as lifecycle state: when
leadership is lost, fenced work must stop before another replica proceeds.

### Usage example

```rust
use elura::adapters::kubernetes::{
    LeaderElectionConfig, run_leader_elected,
};
use tokio_util::sync::CancellationToken;

let client = kube::Client::try_default().await?;
let config = LeaderElectionConfig::new("game", 1, 1, "coordinator-1");
let shutdown = CancellationToken::new();

run_leader_elected(client, config, shutdown, |leader_shutdown| async move {
    run_coordinator(leader_shutdown).await
})
.await?;
```

The runner receives a child cancellation token. Stop fenced work promptly when
that token is cancelled because leadership has been lost.

## Ownership

`OwnershipObserver` with `OwnershipObserverConfig` reads Lease assignments and
implements the observation side of ownership. `OwnershipCoordinator` with
`OwnershipCoordinatorConfig` writes assignments under leader control. Their
configs define namespaces, names, timing, and partition behavior.

Ownership is separate from leader election: leadership decides who coordinates;
ownership decides which replica serves each partition. Use least-privilege RBAC
for observers and separate write permissions for coordinators.

### Usage example

```rust
use std::sync::Arc;

use elura::adapters::kubernetes::{
    OwnershipObserver, OwnershipObserverConfig,
};
use elura::prelude::*;

let observer = Arc::new(
    OwnershipObserver::in_cluster(
        OwnershipObserverConfig::new("game", 1, 1, 64),
    )
    .await?,
);

let gateway = Gateway::new(gateway_config).ownership(64, observer.clone());
let world = World::new(world_config).ownership("world-1", 64, observer.clone());

// Supervise the observer with the process lifecycle.
// observer.run(shutdown_rx).await?;
```

Run `OwnershipCoordinator` only inside the leader-elected task. Feed it the
current World target set with `update_worlds`, then supervise its `run` future.
