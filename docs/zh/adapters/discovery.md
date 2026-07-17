---
outline: [2, 3]
---

# 服务发现 Adapter

`WorldDiscovery` 向 Gateway 提供可路由的 World Target；`WorldRegistrar` 让 World
发布可续租 Lease。发现属于控制面，Gateway Request 仍通过 ELR2 直达选中的 World。

## DNS

`DnsWorldDiscovery` 周期性解析 `DnsWorldDiscoveryConfig` 中的 `host:port`，替换
一个 Region、Realm 与 Route 的目标集。只需要 `adapters` Feature。

它适合稳定服务名与 Kubernetes Headless Service，但除了地址外没有实例元数据。

## Redis 注册与发现

`RedisWorldRegistrar` 发布带过期时间的 `WorldRegistration` Lease，
`RedisWorldDiscovery` 扫描并监听相同 Prefix。启用 `redis`，并确保注册与发现配置
使用相同 `key_prefix`。

TTL 至少应为续租周期的两倍。每个 World 需要唯一 ID，并广播所有 Gateway 都可
访问的地址。相关类型在支持时提供 Standalone 与 Cluster 构造函数。

## Kubernetes Endpoints

`EndpointDiscovery` 执行一次 EndpointSlice 解析；`EndpointWatcher` 持续监听并
更新 Route；`KubernetesWorldDiscovery` 将 Watcher 包装为更高层 Gateway 集成。
启用 `kubernetes`，只授予目标 Namespace 和必要资源的 read/watch 权限。

需要 API 驱动快速收敛或 Endpoint 元数据时选择它；仅靠 Service DNS 足够时优先
使用 DNS。

## 选型

| 环境 | 通常从这里开始 |
| --- | --- |
| 单进程或固定地址 | 应用静态配置 |
| VM/裸机且已有服务 DNS | DNS |
| VM/裸机且需要逐 World Lease | Redis 注册/发现 |
| Kubernetes 简单服务路由 | DNS/Headless Service |
| Kubernetes 需要 EndpointSlice 更新 | Kubernetes Watcher |

也可以为 Consul、etcd 或平台控制面实现 `WorldDiscovery` 与 `WorldRegistrar`。

## 示例：DNS Discovery

```rust
use std::sync::Arc;

use elura::adapters::discovery::{DnsWorldDiscovery, DnsWorldDiscoveryConfig};
use elura::prelude::*;

let config = DnsWorldDiscoveryConfig::new("world.internal:18000", 1, 1);
let discovery = Arc::new(DnsWorldDiscovery::new(config)?);

let gateway = Gateway::new(gateway_config).world_discovery(discovery);
```

迁移到 Redis 或 Kubernetes 时只替换 `discovery`，ELR2 Routing 与游戏 Handler
不需要变化。
