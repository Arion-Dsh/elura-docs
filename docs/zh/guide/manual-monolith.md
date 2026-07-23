---
outline: 2
---

# 手动搭建单体进程

`Monolith` 在同一进程内运行 Gateway 与 World，并直接在内存中分发
命令。它保留类型化 Handler 和公共客户端协议，但不需要内部令牌、World
监听端口或服务发现。

适用于早期开发、小规模部署，以及无需独立扩缩 Gateway/World 的测试。

## 1. 创建 Package

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
elura = { version = "0.2.10", features = ["monolith"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal"] }
```

## 2. 编写应用

组合根分别加载 Gateway、World、传输与管理配置，注册 World Handler 后启动
组合运行时：

```rust [src/bin/monolith.rs]
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
    gateway: GatewayConfig,
    world: WorldConfig,
    admin: AdminServerConfig,
    tcp: TcpConfig,
}

impl AppConfig {
    fn load() -> elura::Result<Self> {
        let path = env::var("APP_MONOLITH_CONFIG")
            .unwrap_or_else(|_| "config/monolith.json".into());
        let mut config: Self = serde_json::from_slice(&fs::read(path)?)?;
        config.gateway.ticket.key = required_env("APP_TICKET_KEY")?;
        config.admin.token = optional_env("APP_ADMIN_TOKEN");
        Ok(config)
    }
}

#[tokio::main]
async fn main() -> elura::Result<()> {
    let app = AppConfig::load()?;
    let tcp = TcpTransport::new(app.tcp)?;
    Monolith::new(app.gateway, app.world)
        .transport(tcp)
        .route(Hello, |_context, request| async move {
            Ok(HelloResponse {
                message: format!("Hello, {}!", request.name),
            })
        })
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

## 3. 配置并运行

```json [config/monolith.json]
{
  "gateway": {
    "ticket": {
      "issuer": "game-login",
      "audience": "game-gateway",
      "login_ttl": { "secs": 60, "nanos": 0 },
      "reconnect_ttl": { "secs": 1800, "nanos": 0 }
    }
  },
  "world": {
    "handler_timeout": { "secs": 5, "nanos": 0 }
  },
  "admin": {
    "listen": "127.0.0.1:17001",
    "component": "monolith",
    "instance_id": "monolith-local"
  },
  "tcp": {
    "listen": "127.0.0.1:17000"
  }
}
```

生成票据密钥并启动进程：

```bash
export APP_TICKET_KEY="$(openssl rand -hex 32)"
cargo run --bin monolith
```

在另一个终端验证：

```bash
curl -i http://127.0.0.1:17001/healthz
curl -i http://127.0.0.1:17001/readyz
```

两个端点都返回 `204 No Content`。命令在进程内分发，因此没有 World 网络端口。

## 扩展到多进程

迁移到拆分拓扑时，Handler 代码可以保持不变。将组合根替换为独立的
`Gateway` 与 `World` 进程，加入内部令牌并显式选择服务发现。

- [手动拆分搭建](./manual-setup)
- [手动分布式搭建](./manual-distributed)
