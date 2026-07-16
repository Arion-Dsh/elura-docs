---
outline: 2
---

# 手动搭建分布式服务

本教程把[手动拆分应用](./manual-setup)升级为可水平扩展的拓扑。Redis 提供
World 注册/发现、共享票据防重放、在线租约、跨 Gateway Push 与会话控制。

```text
客户端 ──> Gateway 1 ─┐                 ┌─> World 1
客户端 ──> Gateway 2 ─┼─ Redis + ELR2 ─┼─> World 2
                     └─────────────────┘
```

## 1. 启用 Redis

保留拆分教程中的依赖，修改 Elura Feature，并添加应用显式使用的 Redis Client：

```toml [Cargo.toml]
elura = { version = "0.1.1", features = ["redis"] }
redis = { version = "1", features = ["tokio-comp", "connection-manager"] }
```

## 2. 注册每个 World

保留拆分教程中的 `Hello` 路由、请求与响应消息以及辅助函数，使用
下面的 World 配置与 `main`：

```rust [src/bin/world.rs]
use std::{env, fs, sync::Arc};

use elura::adapters::discovery::RedisWorldRegistrationConfig;
use elura::prelude::*;
use prost::Message;
use serde::Deserialize;

// 保留拆分教程中的 Hello、HelloRequest 与 HelloResponse。

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: WorldLaunchConfig,
    registration: RedisWorldRegistrationConfig,
    #[serde(skip)]
    instance_id: String,
}

impl AppConfig {
    fn load() -> elura::Result<Self> {
        let path = env::var("APP_WORLD_CONFIG")
            .unwrap_or_else(|_| "config/distributed-world.json".into());
        let mut config: Self = serde_json::from_slice(&fs::read(path)?)?;
        config.runtime.internal_token = required_env("APP_INTERNAL_TOKEN")?;
        config.runtime.admin.token = optional_env("APP_ADMIN_TOKEN");
        config.registration.url = required_env("APP_REDIS_URL")?;
        config.instance_id = required_env("APP_INSTANCE_ID")?;
        config.runtime.admin.instance_id = config.instance_id.clone();
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    let registrar = Arc::new(app.registration.build(&app.instance_id)?);
    WorldLauncher::new(app.runtime)?
        .with_registrar(registrar)
        .configure(|builder| {
            builder.register(
                Hello,
                |_context, request| async move {
                    Ok(HelloResponse {
                        message: format!("Hello, {}!", request.name),
                    })
                },
            )?;
            Ok(())
        })?
        .run()
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

use elura::adapters::discovery::RedisWorldDiscoveryConfig;
use elura::adapters::distributed::RedisOnlineDirectory;
use elura::adapters::redis::{
    RedisReplayStore, RedisSessionControlBus, RedisSessionControlConfig,
    RedisStreamPushBus, RedisStreamPushConfig,
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
    runtime: GatewayLaunchConfig,
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
        config.runtime.internal_token = required_env("APP_INTERNAL_TOKEN")?;
        config.runtime.admin.token = optional_env("APP_ADMIN_TOKEN");
        config.redis_url = required_env("APP_REDIS_URL")?;
        config.discovery.url = config.redis_url.clone();
        if let Some(id) = optional_env("APP_INSTANCE_ID") {
            config.runtime.admin.instance_id = id;
        }
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    let gateway_id = app.runtime.admin.instance_id.clone();
    let prefix = app.distributed.key_prefix.clone();

    let discovery = Arc::new(app.discovery.build()?);
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
    let client = redis::Client::open(app.redis_url.as_str())
        .map_err(|error| elura::Error::InvalidConfig(format!("Redis URL: {error}")))?;
    let session_control = Arc::new(RedisSessionControlBus::new(
        client,
        &gateway_id,
        app.distributed.session_control,
    )?);

    let infrastructure = GatewayInfrastructure::new()
        .with_replay_store(replay)
        .with_online_directory(
            &gateway_id,
            online.clone(),
            app.distributed.lease_ttl,
            app.distributed.renew_interval,
            DuplicateLoginMode::KickExisting,
        )
        .with_push_transport(push)
        .with_session_control_transport(session_control)
        .with_readiness_probe("redis-online", online)?;

    GatewayLauncher::new(app.runtime)?
        .with_infrastructure(infrastructure)?
        .with_world_discovery(discovery)
        .run()
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
    "world": { "listen": "127.0.0.1:18000" },
    "admin": {
      "listen": "127.0.0.1:18001",
      "component": "world",
      "instance_id": "replaced-from-environment"
    }
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
    "gateway": { "listen": "127.0.0.1:17000" },
    "ticket": { "issuer": "game-login", "audience": "game-gateway" },
    "admin": {
      "listen": "127.0.0.1:17001",
      "component": "gateway",
      "instance_id": "gateway-local-1"
    },
    "world_routing": { "pool_size": 2, "max_in_flight_per_connection": 64 }
  },
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
