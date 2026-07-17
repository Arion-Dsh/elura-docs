# 架构

Elura 将公开的客户端传输与私有的游戏逻辑执行分离。Gateway 负责连接和会话，
World 负责业务处理器和游戏状态。

```text
                 公网                          私有网络

 客户端 ── ELR2/TCP、WebSocket 或 QUIC ──> Gateway ── ELR2/TCP ──> World
                                      │   │                     │
                                      │   ├── 服务发现          ├── 处理器
                                      │   ├── 会话状态          ├── 中间件
                                      │   └── 准入控制          └── 持久化
                                      │
                                      └── 管理 HTTP

 可选共享基础设施：Redis、SQL、Kubernetes API、DNS
```

## Gateway 的职责

Gateway 是信任和连接边界，负责：

- 接受 TCP、WebSocket、QUIC 或应用自定义客户端传输；
- 强制执行连接数、载荷、队列、超时和限流规则；
- 验证认证票据与重连票据；
- 为已认证会话签发并轮换重连票据；
- 维护会话状态和心跳；
- 按区域、Realm、路由和可选所有权选择 World；
- 转发命令并返回响应；
- 将 Push 投递给已连接会话；
- 提供健康、就绪、指标、诊断和可选管理操作。

水平扩展时 Gateway 应尽量无状态。需要跨 Gateway 可见或需要在进程重启后保留
的状态——票据防重放、在线状态、Push、会话控制、准入策略和账户版本——必须
显式使用共享适配器。

上层登录服务负责 Credential 验证、账户绑定、Region/Realm 选择、持久 Refresh
Session，并调用 `TicketService::issue_login`。Gateway 只负责短期、一次性的连接
Credential 及其防重放；Refresh Token 和设备登录会话不属于 Gateway。

## World 的职责

World 是私有业务执行边界，负责：

- 接受来自 Gateway 的已认证命令；
- 验证路由 ID 和传输元数据；
- 限制连接数与并发命令；
- 运行中间件与类型化处理器；
- 向处理器提供身份、Trace、会话和 Push 上下文；
- 配置 Registrar 时注册到服务发现；
- 通过管理服务报告运行时诊断信息。

生成的拆分应用使用内部 Bearer Token。生产网络还应结合网络策略，并按威胁模型
启用 TLS 或 mTLS。

## 运行时层与应用层

Elura 在基础设施边界使用依赖反转：

| 运行时契约 | 示例实现 |
| --- | --- |
| `WorldDiscovery` | DNS、Redis、Kubernetes Endpoints |
| `WorldRegistrar` | Redis 注册 |
| `ReplayStore` | 内存或 Redis |
| `OnlineDirectory` | 内存或 Redis Session Lease 生命周期 |
| `OnlineStatsReader` | 内存或 Redis 在线聚合 |
| `OnlineBackend` | 同时实现两个在线契约的任意 Adapter |
| `PushTransport` | 进程内或 Redis Streams |
| `SessionControlTransport` | Redis Streams |
| `AccountVersionStore` | 内存、Redis 或 SQL |
| `AdmissionController` | Redis 准入策略 |

应用显式构造这些组件。Gateway 级服务可通过 `GatewayInfrastructure` 组合；
应用侧的 `Gateway` 与 `World` 类型提供 `world_discovery`、`replay_store`、
`push_transport`、`registrar`、`route` 和 `middleware` 等 Fluent 方法。配置错误与
重复注册错误会由 `build()` 或 `run()` 返回。Elura 不会猜测应该使用哪个适配器或
Provider。

文档也遵守这个边界：[Adapters](/zh/adapters/)整理基础设施实现，
[Providers](/zh/providers/)整理外部业务集成，[指南](/zh/guides/world-development)
说明如何使用两者，而不混合它们的职责。

## 单体与拆分运行时

`Monolith` 保留 Gateway 和 World 的概念，但在进程内连接两者。它消除了
私有网络和服务发现问题，适合本地开发。拆分部署则能验证生产环境真实使用的
连接池、超时、认证、发现和故障行为。

## 故障边界

- 客户端协议错误只关闭或拒绝对应会话，不会停止整个进程。
- Handler Panic 会被捕获并计为 World 故障。
- 超时和有界队列避免工作无限堆积。
- Gateway 后端保护可以限制并发 World 工作，并在短暂故障后打开熔断器。
- 优雅停机会停止接收新工作，并在配置的超时内排空现有任务。
