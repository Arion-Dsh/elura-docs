# 分布式基础设施

生成的应用以进程内状态和 DNS 服务发现起步。只有当某项行为需要跨进程共享
或在进程替换后保留时，才添加共享适配器。本页复核完整的分布式组合；具体实现
细节请查看 [Adapters 目录](/zh/adapters/)。

## 能力矩阵

| 需求 | 契约 | 可用适配器 |
| --- | --- | --- |
| 动态 World 目标 | `WorldDiscovery` | DNS、Redis、Kubernetes Endpoints |
| World 注册 | `WorldRegistrar` | Redis |
| 认证防重放 | `ReplayStore` | 内存、Redis |
| 在线会话目录 | `OnlineDirectory` | 内存、Redis |
| 在线 Session/用户统计 | `OnlineStatsReader` | 内存、Redis |
| 跨 Gateway Push | `PushTransport` | Redis Streams |
| 踢出/撤销活跃会话 | `SessionControlTransport` | Redis Streams |
| 账户版本 | `AccountVersionStore` | 内存、Redis、SQL |
| 准入/限流/封禁状态 | `AdmissionController` | Redis |
| 玩家缓存失效 | `InvalidationBus` | Redis |
| 持久事件投递 | Outbox 契约 | 内存、Redis、SQL |

## 服务发现选型

### DNS

DNS 发现周期性解析 Host 与 Port，并替换指定 Region、Realm 和 Route 的目标集。
它简单且适合 Kubernetes Headless Service，但除了解析出的地址外不提供实例元数据。

### Kubernetes Endpoints

Kubernetes Watcher 监听 EndpointSlice，可直接响应集群状态。应用具备 Kubernetes
API 凭据，并且需要比 DNS 更丰富或更快的收敛时使用。

### Redis

World 在 Redis 中注册租约，Gateway 监听目标集。它适合没有平台原生发现能力
的虚拟机或裸机环境。租约与续租周期既要容忍短暂 Redis/网络故障，也不能让
失效 World 长时间保持可路由状态。

## 分布式会话

多个 Gateway 应构造一致的组件组合：

```text
RedisOnlineDirectory
        +
RedisSessionControlBus    （kick_existing 必需）
        +
RedisStreamPushBus        （跨 Gateway Push）
        +
共享 ReplayStore          （水平扩展票据验证）
```

`RedisOnlineDirectory` 同时实现 `OnlineDirectory` 和 `OnlineStatsReader`，因此
会自动实现 `OnlineBackend`。应用应保留同一个共享 `Arc`，把目录能力注入 Gateway，
把统计能力提供给应用 HTTP 服务或 Worker。参见[在线状态](/zh/adapters/online)。

生成的 Gateway 使用内存 Replay Store。在应用注入共享实现之前保持单副本，
否则同一票据可能被不同副本分别接受。

## Redis Streams

Push 与会话控制传输使用有界 Redis Streams 和 Consumer Group。应配置唯一
Consumer ID、合理的最大长度、Idle Claim 时间、阻塞读取超时和批量大小，
并监控 Pending Entry 与投递失败。

Redis Cluster 中参与同一原子操作的 Key 必须使用兼容的 Hash Tag 和 Prefix。
应验证实际部署拓扑，而不是假设所有 Redis URL 都像单节点一样工作。

## Outbox

Gateway 和 World 不会自动启动 Outbox Dispatcher。需要在同一事务中
写业务数据和事件的应用，必须显式构造、运行、观测并关闭所选 Dispatcher。

## 就绪检查

使用 `with_readiness_probe` 注册必要基础设施。当向进程发送新流量会失败或破坏
正确性时，对应组件应影响 Readiness。不要因为临时依赖故障就让 Liveness 失败，
否则重启循环可能放大事故。
