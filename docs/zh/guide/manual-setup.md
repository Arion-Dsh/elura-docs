---
outline: 2
---

# 手动拆分搭建：不使用 CLI 构建 Elura

`elura` 命令只是脚手架生成器。本教程手动创建同样的最小拆分应用，让你能够
看到每个依赖、组合根和配置边界。

一个进程足够时选择[手动单体搭建](./manual-monolith)；Gateway 与 World 副本
需要共享状态和动态注册时选择[手动分布式搭建](./manual-distributed)。

最终目录结构如下：

```text
my-game/
├── Cargo.toml
├── config/
│   ├── gateway.json
│   └── world.json
└── src/bin/
    ├── gateway.rs
    └── world.rs
```

## 1. 创建 Package

需要 Rust `1.97` 或更新版本。先创建空应用目录：

```bash
mkdir -p my-game/src/bin my-game/config
cd my-game
```

```toml [Cargo.toml]
[package]
name = "my-game"
version = "0.1.0"
edition = "2024"
rust-version = "1.97"
publish = false

[dependencies]
prost = "0.14"
elura = { version = "0.1.1", features = ["adapters"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal"] }
```

`adapters` Feature 提供 DNS 服务发现类型，但不会自动选择 Redis、SQL、
Kubernetes 或任何 Provider。

## 2. 编写 World

World 负责类型化游戏 Handler。下面的示例注册 ID 为 `100` 的 protobuf 路由：

```rust [src/bin/world.rs]
use std::{env, fs};

use elura::prelude::*;
use prost::Message;
use serde::Deserialize;

#[derive(Clone, PartialEq, Message)]
struct HelloRequest {
    #[prost(string, tag = "1")]
    name: String,
}

#[derive(Clone, PartialEq, Message)]
struct HelloResponse {
    #[prost(string, tag = "1")]
    message: String,
}

struct Hello;

impl Route for Hello {
    const ID: u32 = 100;
    const NAME: &'static str = "example.hello";

    type Request = HelloRequest;
    type Response = HelloResponse;
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: WorldLaunchConfig,
}

impl AppConfig {
    fn load() -> elura::Result<Self> {
        let path = env::var("APP_WORLD_CONFIG")
            .unwrap_or_else(|_| "config/world.json".into());
        let mut config: Self = serde_json::from_slice(&fs::read(path)?)?;
        config.runtime.internal_token = required_env("APP_INTERNAL_TOKEN")?;
        config.runtime.admin.token = optional_env("APP_ADMIN_TOKEN");
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    WorldLauncher::new(app.runtime)?
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

fn required_env(name: &str) -> elura::Result<String> {
    env::var(name).map_err(|_| elura::Error::InvalidConfig(format!("{name} is required")))
}

fn optional_env(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}
```

运行时负责解码 `HelloRequest`、提供已认证的 `WorldContext`，再编码
`HelloResponse`。应用路由 ID 必须大于等于 `100`。

## 3. 编写 Gateway

Gateway 接收客户端连接并发现 World。具体 DNS Adapter 会明确出现在 Import
和应用配置中：

```rust [src/bin/gateway.rs]
use std::{env, fs, sync::Arc};

use elura::adapters::discovery::DnsWorldDiscoveryConfig;
use elura::prelude::*;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: GatewayLaunchConfig,
    discovery: DnsWorldDiscoveryConfig,
}

impl AppConfig {
    fn load() -> elura::Result<Self> {
        let path = env::var("APP_GATEWAY_CONFIG")
            .unwrap_or_else(|_| "config/gateway.json".into());
        let mut config: Self = serde_json::from_slice(&fs::read(path)?)?;
        config.runtime.ticket.key = required_env("APP_TICKET_KEY")?;
        config.runtime.internal_token = required_env("APP_INTERNAL_TOKEN")?;
        config.runtime.admin.token = optional_env("APP_ADMIN_TOKEN");
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    let discovery = Arc::new(app.discovery.build()?);
    GatewayLauncher::new(app.runtime)?
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

Elura 本身不会读取 JSON 或环境变量。`AppConfig::load()` 是普通应用代码，
可以替换为其他配置或密钥系统。

## 4. 添加本地配置

监听回环地址，并让 DNS 服务发现指向本地 World 进程：

```json [config/world.json]
{
  "runtime": {
    "world": {
      "listen": "127.0.0.1:18000"
    },
    "admin": {
      "listen": "127.0.0.1:18001",
      "component": "world",
      "instance_id": "world-local"
    }
  }
}
```

```json [config/gateway.json]
{
  "runtime": {
    "gateway": {
      "listen": "127.0.0.1:17000"
    },
    "ticket": {
      "issuer": "game-login",
      "audience": "game-gateway"
    },
    "admin": {
      "listen": "127.0.0.1:17001",
      "component": "gateway",
      "instance_id": "gateway-local"
    },
    "world_routing": {
      "pool_size": 1,
      "max_in_flight_per_connection": 64
    }
  },
  "discovery": {
    "endpoint": "127.0.0.1:18000",
    "region_id": 1,
    "realm_id": 1,
    "route": 0,
    "refresh_interval": { "secs": 1, "nanos": 0 }
  }
}
```

Serde 会使用开发默认值补齐省略的运行时配置，同时拒绝未知字段。

## 5. 创建密钥并运行

运行两次 `openssl rand -hex 32`，将两个不同的结果写入本地环境文件：

```dotenv [config/elura.env]
APP_TICKET_KEY=替换为第一个随机值
APP_INTERNAL_TOKEN=替换为第二个随机值
```

将 `config/elura.env` 加入 `.gitignore`，绝不要提交真实密钥。先启动 World，
再在另一个终端启动 Gateway；两个终端都加载同一文件：

::: code-group

```bash [终端 1 — World]
set -a
. config/elura.env
set +a
cargo run --bin world
```

```bash [终端 2 — Gateway]
set -a
. config/elura.env
set +a
cargo run --bin gateway
```

:::

等待服务发现完成第一次刷新，然后检查私有管理端点：

```bash
curl -i http://127.0.0.1:18001/healthz
curl -i http://127.0.0.1:17001/healthz
curl -i http://127.0.0.1:17001/readyz
```

健康端点返回 `204 No Content`。

## CLI 额外提供什么

上面的手动应用与生成代码使用相同的公共 API。CLI 还会创建环境变量示例、
业务配置示例、Docker 文件、Kubernetes Manifest 和安全的重新生成控制。
它不会添加隐藏运行时，也不会成为生产依赖。

接下来可阅读 [World 模块与路由](/zh/guides/world-development) 来组织 Handler，
或者在需要完整应用脚手架时查看 [CLI 参考](./cli)。
