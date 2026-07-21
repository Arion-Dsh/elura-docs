# 会话与路由

Elura 将账户身份、实时传输会话和当前负责游戏工作的 World 节点分开建模。

## 身份

已认证身份包含：

| 字段 | 用途 |
| --- | --- |
| `account_id` | 稳定的账户主体 |
| `region_id` | 地理或基础设施分区 |
| `realm_id` | 游戏 Realm/服务器分区 |
| `user_id` | 玩家或角色主体 |
| `generation` | 用于撤销的账户版本 |

上层登录服务验证 Credential、解析账户、选择 Region 与 Realm，然后调用
`TicketService::issue_login`。生成的登录票据短期有效且只能使用一次。每张票据
都必须显式携带 `login` 或 `reconnect` 用途；Gateway 会验证 Issuer、Audience、
签名、用途、有效期、身份和重放状态，然后才把身份绑定到会话。

`TicketService` 分别配置两种用途的有效期。生成的 Gateway 默认使用 60 秒
`login_ttl` 和 30 分钟 `reconnect_ttl`；两者都必须大于零且不超过一小时。

## 会话生命周期

会话依次经历传输、认证、活跃、排空和关闭状态。Gateway 在允许应用路由前会
强制认证截止时间。心跳维持活跃性，空闲时间超过 `idle_timeout` 的会话会关闭。

票据过期不会关闭已经认证的会话。每次认证成功时，Gateway 都返回一张新的重连
票据及其 `expires_in_seconds`，客户端只保存最新的一张。

保持连接时，客户端应在临近过期时把当前重连票据发送到路由 `3`。续票会消费
当前票据并返回替代票据。发生断线后，客户端建立新连接，把最新重连票据发送到
认证路由 `1`；认证成功会消费该票据并再次返回下一张重连票据。

如果重连票据丢失或过期，客户端使用上层应用保存的 Refresh Session 向登录服务
申请新的登录票据。Elura 负责 Gateway 票据验证与轮换；上层应用负责 Refresh
Token、设备会话、Credential 重新验证以及是否显示登录 UI。Sequence 用于处理
断线前后的消息交付；重试时机、状态对账和 UI 行为仍属于客户端策略。

## 登录排队与容量

上层应用负责登录队列顺序、优先级、排队 Token、位置与预计时间，以及客户端轮询
或通知。排队中的客户端不应占用匿名 Gateway 连接；登录服务只有在允许发起认证后
才签发短有效期登录票据。

Gateway 通过 `OnlineDirectory::acquire` 原子执行重复登录策略、容量检查和 Lease
注册，从而落实最终的 Region/Realm 已认证 Session 上限。Realm 已满时返回可重试
的 `REALM_FULL` 和 `retry_after_ms`，且不消费登录票据。参见
[在线状态 API](/zh/adapters/online#登录排队与-realm-容量)。

## 重复登录

在线目录将玩家键关联到 Gateway/Session Lease。`AllowMultiple` 保留全部 Session，
`RejectNew` 在已有活跃 Session 时拒绝新 Session，`KickExisting` 则准入新 Session
并关闭旧 Session。分布式 `KickExisting` 必须同时配置共享 `OnlineDirectory` 和
`SessionControlTransport`；只配置其中一个会被拒绝。

租约设置必须满足：

```text
0 < renew_interval < lease_ttl
```

典型的生成配置使用 45 秒租约和 15 秒续租周期。

## 在线状态与生命周期 Observer

`OnlineDirectory` 是存活 Session Lease 的事实来源。`OnlineStatsReader` 同时提供
已认证 Session 数和按 `user_id` 去重的玩家数；完整 Adapter 实现
`OnlineBackend`，即两个契约的自动组合。

Gateway 还通过 `SessionObserver` 提供 `Connected`、`Authenticated` 和 `Closed`
变化。`Closed` 会保留已认证身份，但只表示一个 Session 结束，不一定是玩家的
最后一个 Session。应用应将事件放入队列，查询 `user_sessions`，仅在没有存活
Session 时把玩家标为离线。

Observer 是进程内、尽力而为的通知。Gateway 进程突然终止时无法发送 `Closed`，
但 Lease 仍会通过 TTL 过期，因此持久业务投影需要与在线目录定期对账。参见
[在线状态 API](/zh/adapters/online)。

## 账户版本

身份中的 Generation 支持撤销活跃或正在重连的会话。`AccountVersionStore` 可以
保存最低允许版本。运维人员可以通过管理 API 提高该值，使旧身份按会话策略被
拒绝或退出。

## World 路由

Gateway 路由键包括 Region、Realm 和 Route。服务发现为每个键提供一组存活的
`WorldRouteTarget`，Gateway 为选中的目标维护私有连接池。

路由 `0` 可作为默认目标集。不同 World 分组负责不同业务域时，应用也可以发布
更具体的路由 ID。

## 所有权与分片

对于有状态工作负载，`OwnershipResolver` 将玩家映射到分片和指定 World 实例。
所有权元数据包含 Shard ID、World ID 和 Epoch。Epoch 可阻止重新平衡后的旧
Owner 继续接收工作。

服务发现回答“哪些实例能够处理此路由”，所有权回答“哪个实例当前拥有该玩家
的状态”。应始终分开这两个决策。
