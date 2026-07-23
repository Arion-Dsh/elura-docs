# 应用 HTTP 服务

`Gateway::http(...)` 与 `World::http(...)` 把应用自有 Axum Router 加入 Elura
生命周期。它适合登录端点、Provider 回调、Webhook、内部 API 或游戏 REST API。

应用 HTTP 不是 ELR2 [客户端传输](./transports)，也不是
`.run(AdminServerConfig)` 创建的私有管理服务。三者拥有独立监听地址和安全策略。

| 网络入口 | 组合 API | 用途 |
| --- | --- | --- |
| 应用 HTTP | `Gateway::http(...)` / `World::http(...)` | 应用路由与回调 |
| 客户端传输 | `Gateway::transport(...)` | ELR2 游戏会话 |
| 管理 HTTP | `.run(AdminServerConfig)` | `/elura/healthz`、指标、诊断与管理操作 |

## 添加 Axum Router

在上层应用中加入 Axum：

```toml
[dependencies]
axum = "0.8"
elura = "0.2.7"
```

创建普通 Axum `Router`，再通过 `.http(...)` 为它分配独立监听地址：

```rust
use axum::{Json, Router, routing::get};
use serde_json::{Value, json};

async fn application_health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

fn application_router() -> Router {
    Router::new().route("/healthz", get(application_health))
}

let tcp = TcpTransport::new(tcp_config)?;
Gateway::new(gateway_config)
    .transport(tcp)
    .world_discovery(discovery)
    .http("127.0.0.1:19000", application_router())
    .run(admin_config)
    .await?;
```

Router 完全由应用管理，可以像普通 Axum 应用一样加入 State、中间件、认证、
CORS、请求限制和 Trace。Elura 不会自动使用管理 Bearer Token 保护应用 HTTP
路由。

需要独立 Router 或监听地址时，可以多次调用 `.http(...)`。

## 暴露在线人数

应用 Router 可以只保存统计能力，而不依赖具体 Redis Adapter：

```rust
use std::sync::Arc;

use axum::{extract::{Path, State}, Json};
use elura::prelude::{OnlineStats, OnlineStatsReader};

#[derive(Clone)]
struct OnlineApi {
    stats: Arc<dyn OnlineStatsReader>,
}

async fn online_totals(
    State(api): State<OnlineApi>,
    Path((region_id, realm_id)): Path<(u32, u32)>,
) -> Result<Json<OnlineStats>, ApplicationHttpError> {
    Ok(Json(api.stats.stats(region_id, realm_id).await?))
}
```

`OnlineStats::user_count` 表示去重玩家数，`session_count` 表示已认证连接数。
鉴权、缓存、对外人数取整和机器人过滤由应用负责。参见
[在线状态 API](/zh/adapters/online)。

## 在 World 旁运行 HTTP

独立 World 可以在另一端口托管应用 HTTP，适合需要与游戏状态一起运行的私有
服务回调或应用 API：

```rust
World::new(world_config)
    .route(GetPlayerProfile, get_player_profile)
    .http("127.0.0.1:19001", application_router())
    .run(admin_config)
    .await?;
```

## 单体中的 HTTP

启用 `monolith` Feature：

```toml
elura = { version = "0.2.7", features = ["monolith"] }
```

组合进程需要由 Gateway 或 World 持有的 HTTP 时，使用 `Monolith::gateway` 与
`Monolith::world`：

```rust
Monolith::new(gateway_config, world_config)
    .transport(TcpTransport::new(tcp_config)?)
    .route(GetPlayerProfile, get_player_profile)
    .gateway(|gateway| {
        gateway.http("127.0.0.1:19000", public_router())
    })
    .world(|world| {
        world.http("127.0.0.1:19001", private_router())
    })
    .run(admin_config)
    .await?;
```

每个应用 HTTP 服务都由对应 Gateway 或 World 的生命周期监管并接收优雅停机
信号。Bind 或 Serve 失败会停止组合进程，并把错误返回应用。

## 监听地址与安全规则

- 应用 HTTP、客户端传输、管理 HTTP 与独立 World 必须使用互不冲突的监听地址。
  `0.0.0.0:19000` 会与所有使用 `19000` 端口的监听冲突。
- 无效地址和监听冲突由 `build()` 或 `run()` 返回；Fluent 注册不会 Panic。
- 管理 HTTP 应保持私有，不要通过公开应用 Router 再次暴露 `/elura/*`。
- 显式为应用 HTTP 配置认证、CORS、Body Limit、Timeout 与代理信任范围。
- `.http(...)` Helper 提供明文 HTTP。应将其放在可信 TLS 终止代理之后；需要
  直接终止 TLS 时，应运行应用自有 HTTPS Server。
