# Crate 与功能开关

Workspace 被拆分为职责明确的 Crate。多数应用只需依赖 `elura` 门面并启用对应
功能。

## Workspace Crate

| Crate | 用途 | 是否作为应用依赖发布？ |
| --- | --- | --- |
| `elura` | 统一门面与功能选择 | 是，推荐 |
| `elura-core` | 协议、会话、路由、票据和实时通信原语 | 低层集成时使用 |
| `elura-runtime` | 生命周期、安全、管理服务和可观测性 | 通常通过 `elura` |
| `elura-gateway` | 客户端连接与会话运行时 | 通常通过 `elura` |
| `elura-world` | 命令与玩家状态运行时 | 通常通过 `elura` |
| `elura-room` | 应用自有的房间成员和生命周期 | 通常通过 `elura` |
| `elura-aoi` | 稀疏网格二维可见性索引 | 通常通过 `elura` |
| `elura-simulation` | 确定性固定步长时序 | 通常通过 `elura` |
| `elura-netcode` | Tick 对齐、输入冗余、预测和插值 | 通常通过 `elura` |
| `elura-replication` | 按观察者维护实体生命周期与状态同步 | 通常通过 `elura` |
| `elura-lag-compensation` | 有界权威历史和倒带查询 | 通常通过 `elura` |
| `elura-net-sim` | 确定性弱网模拟 | 开发与测试 |
| `elura-monolith` | 单进程 Gateway 与 World 组合 | 通常通过 `elura` |
| `elura-testkit` | 可选 Transport 的全链路业务测试与压测 | 开发依赖 |
| `elura-adapters` | Redis、SQL、DNS、Kubernetes、Outbox 适配器 | 通常通过 `elura` |
| `elura-providers` | 身份、OTP、短信和支付 Provider | 通常通过 `elura` |
| `elura-cli` | 项目脚手架命令 | 作为工具安装 |
| `elura-load` | 可选 Transport 的框架回归压测工具 | 仅框架维护者；`publish = false` |
| `elura-perf` | 可复现的多 Gateway 回归环境 | 仅框架维护者；`publish = false` |

## 门面功能

`elura` 默认启用 `gateway` 与 `world`。两者都包含 `runtime`，而 `runtime`
包含 `core`。

| Feature | 启用内容 |
| --- | --- |
| `core` | `elura-core` |
| `runtime` | `core`、`elura-runtime` |
| `gateway` | `runtime`、`elura-gateway` |
| `world` | `runtime`、`elura-world` |
| `monolith` | `gateway`、`world`、`elura-monolith` |
| `room` | `elura-room` |
| `aoi` | `elura-aoi` |
| `simulation` | `elura-simulation` |
| `netcode` | `elura-netcode` |
| `replication` | `elura-replication`；内部使用 `elura-netcode` |
| `lag-compensation` | `elura-lag-compensation` |
| `net-sim` | `elura-net-sim` |
| `adapters` | `runtime`、基础 `elura-adapters` |
| `redis` | `adapters`、`gateway`、`world`、Redis 适配器实现 |
| `sql` | `adapters`、SQL 适配器实现 |
| `kubernetes` | `adapters`、`gateway`、Kubernetes 适配器实现 |
| `admin` | `adapters`、适配器支持的管理能力 |
| `providers` | `core`、基础 `elura-providers` |
| `identity` | 身份 Provider 集合；同时启用 `gateway` 时也启用 Gateway HTTP 身份桥接 |
| `notification-alisms` | 阿里云短信通知 Provider |
| `otp` | OTP 服务与存储集成 |
| `payment-alipay` | 支付宝 |
| `payment-apple` | Apple 购买验证 |
| `payment-douyin` | 抖音支付 |
| `payment-quicksdk` | QuickSDK 支付 |
| `payment-wechat-mini` | 微信小程序支付 |
| `payment-wechat-pay` | 微信支付 |
| `full` | 上述全部可选游戏原语、适配器和 Provider |

## 门面导入

门面刻意保持较小的 Crate 根级：`elura::Error` 和 `elura::Result` 位于根级，
其余 API 按职责组织。

常用应用契约和运行时类型可从 Prelude 导入：

```rust
use elura::prelude::{
    AdminServerConfig, Gateway, GatewayConfig, Identity, OnlineBackend,
    OnlineDirectory, OnlineStatsReader, Route, SessionEvent, SessionObserver,
    TcpConfig, TcpTransport, World, WorldConfig, WorldContext,
};
```

在线契约位于 Prelude，具体 Backend 仍需显式导入：

```rust
use elura::adapters::online::RedisOnlineDirectory; // `redis`
```

需要在调用处明确职责时，使用领域模块：

```rust
use elura::world::{World, WorldModule, WorldModuleRegistry};
use elura::world::middleware::LoggingMiddleware;
use elura::world::testing::{test_identity, WorldHarness, WorldTestClient};
use elura_testkit::{FullStackBuilder, FullStackLoadConfig};
use elura::gateway::GatewayInfrastructure;
use elura::{aoi, lag_compensation, netcode, replication, room, simulation};
```

具体基础设施和 Provider 实现不会加入 Prelude，应从对应的 Feature Gate
命名空间导入：

```rust
use elura::adapters::discovery::{DnsWorldDiscovery, DnsWorldDiscoveryConfig};
use elura::adapters::replay::RedisReplayStore; // `redis`
use elura::providers::identity::GuestProvider; // `identity`
use elura::providers::payment::WechatPayPayment; // `payment-wechat-pay`
```

同时启用 `gateway` 与 `identity` 后，Prelude 还会导出
`IdentityHttpBackend` 和 `IdentityHttpPolicy`。`HttpAuthApi`、
`HttpBearerAuth`、`AuthenticatedHttp` 以及 HTTP Token 类型由常规
`gateway`/`core` Feature 提供。

这样可以在 Code Review 中直接看出 Redis、Kubernetes、SQL 或第三方 API
依赖。条目是否可用仍由 Feature 决定。Provider 操作使用
`elura::providers::ProviderResult`；启用对应 Feature 后，常用 Provider Trait
也可从 Prelude 导入。

## 示例

```toml
# Gateway + World runtime only (default)
elura = "0.2.10"

# Generated split project with DNS discovery types
elura = { version = "0.2.10", features = ["adapters"] }

# Redis-backed distributed application
elura = { version = "0.2.10", features = ["redis"] }

# Kubernetes discovery and SQL account versions
elura = { version = "0.2.10", features = ["kubernetes", "sql"] }

# 权威实时游戏原语
elura = { version = "0.2.10", features = [
  "room", "aoi", "simulation", "netcode", "replication",
  "lag-compensation",
] }
```

CLI 会把自身对应的 Elura 精确版本写入生成清单。请让 CLI 与门面 Crate 使用同一
Release，确保生成源码与导入 API 一致。

## Rustdoc

条目级签名查 docs.rs，架构和运维指南查本站：

- `https://docs.rs/elura`
- `https://docs.rs/elura-core`
- `https://docs.rs/elura-runtime`
- `https://docs.rs/elura-adapters`
- `https://docs.rs/elura-providers`
- `https://docs.rs/elura-room`
- `https://docs.rs/elura-aoi`
- `https://docs.rs/elura-simulation`
- `https://docs.rs/elura-netcode`
- `https://docs.rs/elura-replication`
- `https://docs.rs/elura-lag-compensation`
- `https://docs.rs/elura-net-sim`
