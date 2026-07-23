---
outline: 2
---

# 手动搭建分布式服务

本教程把[手动拆分应用](./manual-setup)升级为可水平扩展的拓扑。Gateway 与 World
之间的应用流量通过 ELR2 直接传输；Redis 不是这条数据路径上的代理或 Broker。
本教程使用现成的 Redis 适配器实现 World 注册/发现、共享票据防重放、在线租约、
跨 Gateway Push 与会话控制。

```text
应用数据：
客户端 ──> Gateways ── ELR2 ──> Worlds

共享状态与控制：
Gateways <──> 可替换基础设施 <──> Worlds
                 （本教程使用 Redis）
```

这些基础设施职责由多个独立的核心 Trait 抽象，并不是一个固定的中间件依赖。
应用可以混用现有的内存、DNS、Kubernetes、SQL 与 Redis 适配器，也可以提供自定义
实现。本教程选择 Redis，是因为仓库为下面的拓扑提供了一套完整的 Redis 适配器。

## 1. 启用 Redis

保留拆分教程中的依赖并修改 Elura Feature。Facade 会启用适配器内部使用的 Redis
Client，因此本示例无需在应用中直接依赖 `redis`：

```toml [Cargo.toml]
elura = { version = "0.2.7", features = ["redis"] }
```

## 2. 注册每个 World

保留拆分教程中的 `Hello` 路由、请求与响应消息以及辅助函数，使用
下面的 World 配置与 `main`：

```rust [src/bin/world.rs]
use std::{env, fs, sync::Arc};

use elura::adapters::discovery::{RedisWorldRegistrar, RedisWorldRegistrationConfig};
use elura::prelude::*;
use prost::Message;
use serde::Deserialize;

// 保留拆分教程中的 Hello、HelloRequest 与 HelloResponse。

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: WorldConfig,
    admin: AdminServerConfig,
    registration: RedisWorldRegistrationConfig,
    #[serde(skip)]
    instance_id: String,
    #[serde(skip)]
    redis_url: String,
}

impl AppConfig {
    fn load() -> elura::Result<Self> {
        let path = env::var("APP_WORLD_CONFIG")
            .unwrap_or_else(|_| "config/distributed-world.json".into());
        let mut config: Self = serde_json::from_slice(&fs::read(path)?)?;
        config.runtime.internal_token = Some(required_env("APP_INTERNAL_TOKEN")?);
        config.admin.token = optional_env("APP_ADMIN_TOKEN");
        config.redis_url = required_env("APP_REDIS_URL")?;
        config.instance_id = required_env("APP_INSTANCE_ID")?;
        config.admin.instance_id = config.instance_id.clone();
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    let registrar = Arc::new(
        RedisWorldRegistrar::connect(&app.redis_url, &app.instance_id, app.registration).await?,
    );
    World::new(app.runtime)
        .registrar(registrar)
        .route(Hello, |_context, request| async move {
            Ok(HelloResponse {
                message: format!("Hello, {}!", request.name),
            })
        })
        .run(app.admin)
        .await
}

// 保留拆分教程中的 required_env 与 optional_env。
```

每个副本必须使用唯一的 `APP_INSTANCE_ID`，并广播所有 Gateway 都能访问的地址。

## 3. 组装 Gateway 分布式状态

使用下面的 Gateway 组合代码。具体 Redis 类型不进入 Prelude，因此调用处可以
直接看见分布式依赖：

```rust [src/bin/gateway.rs]
use std::{env, fs, sync::Arc, time::Duration};

use elura::adapters::discovery::{RedisWorldDiscovery, RedisWorldDiscoveryConfig};
use elura::adapters::online::RedisOnlineDirectory;
use elura::adapters::push::{RedisStreamPushBus, RedisStreamPushConfig};
use elura::adapters::replay::RedisReplayStore;
use elura::adapters::session_control::{
    RedisSessionControlBus, RedisSessionControlConfig,
};
use elura::prelude::*;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DistributedConfig {
    key_prefix: String,
    lease_ttl: Duration,
    renew_interval: Duration,
    push: RedisStreamPushConfig,
    session_control: RedisSessionControlConfig,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: GatewayConfig,
    admin: AdminServerConfig,
    tcp: TcpConfig,
    discovery: RedisWorldDiscoveryConfig,
    distributed: DistributedConfig,
    #[serde(skip)]
    redis_url: String,
}

impl AppConfig {
    fn load() -> elura::Result<Self> {
        let path = env::var("APP_GATEWAY_CONFIG")
            .unwrap_or_else(|_| "config/distributed-gateway.json".into());
        let mut config: Self = serde_json::from_slice(&fs::read(path)?)?;
        config.runtime.ticket.key = required_env("APP_TICKET_KEY")?;
        config.runtime.internal_token = Some(required_env("APP_INTERNAL_TOKEN")?);
        config.admin.token = optional_env("APP_ADMIN_TOKEN");
        config.redis_url = required_env("APP_REDIS_URL")?;
        if let Some(id) = optional_env("APP_INSTANCE_ID") {
            config.admin.instance_id = id;
        }
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    let gateway_id = app.admin.instance_id.clone();
    let prefix = app.distributed.key_prefix.clone();

    let discovery = Arc::new(
        RedisWorldDiscovery::connect(&app.redis_url, app.discovery).await?,
    );
    let replay = Arc::new(
        RedisReplayStore::connect(&app.redis_url, format!("{prefix}:replay")).await?,
    );
    let online = Arc::new(
        RedisOnlineDirectory::connect(
            &app.redis_url,
            format!("{prefix}:online"),
            app.distributed.lease_ttl,
        )
        .await?,
    );
    let push = Arc::new(RedisStreamPushBus::new(
        online.clone(),
        &gateway_id,
        app.distributed.push,
    )?);
    let session_control = Arc::new(RedisSessionControlBus::connect(
        &app.redis_url,
        &gateway_id,
        app.distributed.session_control,
    ).await?);
    let tcp = TcpTransport::new(app.tcp)?;
    let online_config = GatewayOnlineConfig::new(
        gateway_id.clone(),
        app.distributed.lease_ttl,
        app.distributed.renew_interval,
        DuplicateLoginMode::KickExisting,
    );

    Gateway::new(app.runtime)
        .transport(tcp)
        .replay_store(replay)
        .online_directory(online.clone(), online_config)
        .push_transport(push)
        .session_control_transport(session_control)
        .readiness_probe("redis-online", online)
        .world_discovery(discovery)
        .run(app.admin)
        .await
}

fn required_env(name: &str) -> elura::Result<String> {
    env::var(name).map_err(|_| elura::Error::InvalidConfig(format!("{name} is required")))
}

fn optional_env(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}
```

`kick_existing` 只有在在线目录与会话控制传输同时安装时才有效。Readiness Probe
可在共享在线目录不可用时阻止新流量进入。

## 4. 添加配置

```json [config/distributed-world.json]
{
  "runtime": {
    "listen": "127.0.0.1:18000"
  },
  "admin": {
    "listen": "127.0.0.1:18001",
    "component": "world",
    "instance_id": "replaced-from-environment"
  },
  "registration": {
    "key_prefix": "elura:worlds",
    "advertise_address": "127.0.0.1:18000",
    "region_id": 1,
    "realm_id": 1,
    "route": 0,
    "ttl": { "secs": 30, "nanos": 0 },
    "renew_interval": { "secs": 10, "nanos": 0 }
  }
}
```

```json [config/distributed-gateway.json]
{
  "runtime": {
    "ticket": {
      "issuer": "game-login",
      "audience": "game-gateway",
      "login_ttl": { "secs": 60, "nanos": 0 },
      "reconnect_ttl": { "secs": 1800, "nanos": 0 }
    },
    "world_routing": { "pool_size": 2, "max_in_flight_per_connection": 64 }
  },
  "admin": {
    "listen": "127.0.0.1:17001",
    "component": "gateway",
    "instance_id": "gateway-local-1"
  },
  "tcp": { "listen": "127.0.0.1:17000" },
  "discovery": {
    "key_prefix": "elura:worlds",
    "refresh_interval": { "secs": 5, "nanos": 0 }
  },
  "distributed": {
    "key_prefix": "elura",
    "lease_ttl": { "secs": 45, "nanos": 0 },
    "renew_interval": { "secs": 15, "nanos": 0 },
    "push": {},
    "session_control": { "stream": "elura:session:control" }
  }
}
```

## 5. 运行拓扑

本地开发时先启动 Redis，并创建共享环境变量文件：

```bash
docker run --name elura-redis --rm -p 6379:6379 redis:7-alpine
```

```dotenv [config/distributed.env]
APP_REDIS_URL=redis://127.0.0.1:6379/
APP_TICKET_KEY=替换为至少32字节的随机值
APP_INTERNAL_TOKEN=替换为另一个至少32字节的随机值
```

每个终端加载该文件，再指定唯一实例 ID：

```bash [World]
set -a; . config/distributed.env; set +a
export APP_INSTANCE_ID=world-local-1
cargo run --bin world
```

```bash [Gateway]
set -a; . config/distributed.env; set +a
export APP_INSTANCE_ID=gateway-local-1
cargo run --bin gateway
```

Gateway 发现已注册的 World 后进入就绪状态。增加副本前，必须为每个进程设置
唯一实例 ID、监听地址和管理地址，并为每个 World 设置唯一且可达的广播地址。

## 生产约束

- 所有 Gateway 使用相同票据密钥、内部令牌、Redis 部署和兼容 Prefix。
- 每个 Gateway ID 唯一，每个 World 注册 ID 唯一。
- 在线会话满足 `0 < renew_interval < lease_ttl`。
- World 注册 TTL 至少为续租间隔的两倍。
- Redis Cluster 使用 Cluster 专用构造函数及兼容的 Hash Tag 规则。
- World 与 Redis 保持私有，只公开 Gateway 客户端监听端口。

部署前继续阅读[分布式基础设施](/zh/guides/distributed)与
[生产检查清单](/zh/reference/production-checklist)。
