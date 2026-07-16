# Crate 与功能开关

Workspace 被拆分为职责明确的 Crate。多数应用只需依赖 `elura` 门面并启用对应
功能。

## Workspace Crate

| Crate | 用途 | 是否作为应用依赖发布？ |
| --- | --- | --- |
| `elura` | 统一门面与功能选择 | 是，推荐 |
| `elura-core` | 协议、会话、路由、票据和实时通信原语 | 低层集成时使用 |
| `elura-runtime` | Gateway、World、传输、Launcher 和可观测性 | 通常通过 `elura` |
| `elura-adapters` | Redis、SQL、DNS、Kubernetes、Outbox 适配器 | 通常通过 `elura` |
| `elura-providers` | 身份、OTP、短信和支付 Provider | 通常通过 `elura` |
| `elura-cli` | 项目脚手架命令 | 作为工具安装 |
| `elura-load` | 连接与请求压测工具 | 仅开发使用 |
| `elura-perf` | 可复现性能场景 | Workspace 内部使用 |

## 门面功能

`elura` 默认启用 `runtime`，而 `runtime` 包含 `core`。

| Feature | 启用内容 |
| --- | --- |
| `core` | `elura-core` |
| `runtime` | `core`、`elura-runtime` |
| `adapters` | `runtime`、基础 `elura-adapters` |
| `redis` | `adapters`、Redis 适配器实现 |
| `sql` | `adapters`、SQL 适配器实现 |
| `kubernetes` | `adapters`、Kubernetes 适配器实现 |
| `admin` | `adapters`、适配器支持的管理能力 |
| `providers` | `core`、基础 `elura-providers` |
| `identity` | 身份 Provider 集合 |
| `notification-alisms` | 阿里云短信通知 Provider |
| `otp` | OTP 服务与存储集成 |
| `payment-alipay` | 支付宝 |
| `payment-apple` | Apple 购买验证 |
| `payment-douyin` | 抖音支付 |
| `payment-quicksdk` | QuickSDK 支付 |
| `payment-wechat-mini` | 微信小程序支付 |
| `payment-wechat-pay` | 微信支付 |
| `full` | 上述全部适配器和 Provider |

## 门面导入

门面刻意保持较小的 Crate 根级：`elura::Error` 和 `elura::Result` 位于根级，
其余 API 按职责组织。

常用应用契约和运行时类型可从 Prelude 导入：

```rust
use elura::prelude::{
    GatewayLaunchConfig, GatewayLauncher, Identity, WorldBuilder, WorldContext,
};
```

需要在调用处明确职责时，使用领域模块：

```rust
use elura::world::{WorldBuilder, WorldModule};
use elura::world::middleware::LoggingMiddleware;
use elura::world::testing::WorldHarness;
use elura::gateway::GatewayInfrastructure;
```

具体基础设施和 Provider 实现不会加入 Prelude，应从对应的 Feature Gate
命名空间导入：

```rust
use elura::adapters::discovery::DnsWorldDiscoveryConfig;
use elura::adapters::redis::RedisReplayStore; // `redis`
use elura::providers::identity::GuestProvider; // `identity`
use elura::providers::payment::WechatPayPayment; // `payment-wechat-pay`
```

这样可以在 Code Review 中直接看出 Redis、Kubernetes、SQL 或第三方 API
依赖。条目是否可用仍由 Feature 决定。Provider 操作使用
`elura::providers::ProviderResult`；启用对应 Feature 后，常用 Provider Trait
也可从 Prelude 导入。

## 示例

```toml
# Gateway + World runtime only (default)
elura = "0.1.1"

# Generated split project with DNS discovery types
elura = { version = "0.1.1", features = ["adapters"] }

# Redis-backed distributed application
elura = { version = "0.1.1", features = ["redis"] }

# Kubernetes discovery and SQL account versions
elura = { version = "0.1.1", features = ["kubernetes", "sql"] }
```

在 `0.x` 阶段应锁定精确兼容版本，并在升级前查看 Release Notes。

## Rustdoc

条目级签名查 docs.rs，架构和运维指南查本站：

- `https://docs.rs/elura`
- `https://docs.rs/elura-core`
- `https://docs.rs/elura-runtime`
- `https://docs.rs/elura-adapters`
- `https://docs.rs/elura-providers`
