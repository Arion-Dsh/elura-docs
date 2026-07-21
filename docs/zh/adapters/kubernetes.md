---
outline: [2, 3]
---

# Kubernetes Adapter

只有需要访问 Kubernetes API 的进程才启用 `kubernetes`。Service 已能通过 DNS
满足发现需求、且不需要 Controller 行为时，应优先使用 DNS。

## Endpoint Discovery

`EndpointWatcher` 按 `EndpointWatcherConfig` 监听 EndpointSlice；
`EndpointDiscovery` 将 Snapshot 转为 World Target；`KubernetesWorldDiscovery`
与 Gateway Routing 集成。

只授予目标 Namespace 和 EndpointSlice 的 read/watch 权限。监控
`EndpointWatcherStats`，API 短暂故障时保留 Last-known-good Target Set。

### 使用示例

```rust
use std::sync::Arc;

use elura::adapters::discovery::KubernetesWorldDiscovery;
use elura::adapters::kubernetes::EndpointWatcherConfig;
use elura::prelude::*;

let config = EndpointWatcherConfig::new("game", "world", "elr2", 1, 1);
let discovery = Arc::new(KubernetesWorldDiscovery::new(config)?);
let gateway = Gateway::new(gateway_config).world_discovery(discovery);
```

此例要求 Service Port 名称为 `elr2`，Gateway ServiceAccount 在 `game` Namespace
拥有 EndpointSlice read/watch 权限。

## Leader Election

`run_leader_elected` 与 `LeaderElectionConfig` 使用 Kubernetes Lease，让多个副本
只有一个执行活跃任务。失去 Leadership 后，受 Fencing 保护的工作必须在新副本
继续前停止。

### 使用示例

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

Runner 会收到一个子 Cancellation Token。Leadership 丢失导致 Token 取消时，必须
尽快停止受 Fencing 保护的工作。

## Ownership

`OwnershipObserver` 使用 `OwnershipObserverConfig` 读取 Lease Assignment；
`OwnershipCoordinator` 使用 `OwnershipCoordinatorConfig` 在 Leader 控制下写入
Assignment。Leadership 决定谁协调，Ownership 决定每个 Partition 由谁服务，
两者不是同一个概念。

Observer 使用最小只读 RBAC，Coordinator 的写权限应单独授予。

### 使用示例

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

// 由进程生命周期监督 Observer。
// observer.run(shutdown_rx).await?;
```

`OwnershipCoordinator` 只能在 Leader-elected Task 中运行。使用 `update_worlds`
传入当前 World Target Set，然后监督它的 `run` Future。
