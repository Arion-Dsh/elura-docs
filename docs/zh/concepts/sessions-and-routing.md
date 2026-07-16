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

登录服务签发包含这些 Claims 的短期票据。Gateway 会验证 Issuer、Audience、
签名、过期时间和重放状态，然后才将身份写入会话。

## 会话生命周期

会话依次经历传输、认证、活跃、排空和关闭状态。Gateway 在允许应用路由前会
强制认证截止时间。心跳维持活跃性，空闲时间超过 `idle_timeout` 的会话会关闭。

重连票据允许客户端在不重新执行原始登录流程的情况下恢复会话。序号帮助运行时
处理断线前后的消息交付。具体的客户端策略——重试时间、状态对账和 UI 行为——
仍由游戏客户端决定。

## 重复登录

在线目录将玩家键关联到 Gateway/会话租约。策略可以允许新会话替换旧租约，或
踢出已有会话。分布式 `kick_existing` 必须同时配置共享 `OnlineDirectory` 和
`SessionControlTransport`；只配置其中一个会被拒绝。

租约设置必须满足：

```text
0 < renew_interval < lease_ttl
```

典型的生成配置使用 45 秒租约和 15 秒续租周期。

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

