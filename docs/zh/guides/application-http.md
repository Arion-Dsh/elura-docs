# 应用 HTTP 服务

`Gateway::http(...)` 与 `World::http(...)` 把应用自有 Axum Router 加入 Elura
生命周期。它适合登录端点、Provider 回调、Webhook、内部 API 或游戏 REST API。

应用 HTTP 不是 ELR2 [客户端传输](./transports)，也不是
`.run(AdminServerConfig)` 创建的私有管理服务。三者拥有独立监听地址和安全策略。

| 网络入口 | 组合 API | 用途 |
| --- | --- | --- |
| 应用 HTTP | `Gateway::http(...)` / `World::http(...)` | 应用路由与回调 |
| 客户端传输 | `Gateway::transport(...)` | ELR2 游戏会话 |
| 管理 HTTP | `.run(AdminServerConfig)` | `/healthz`、`/readyz`、`/elura/metrics`、诊断与管理操作 |

## 添加 Axum Router

在上层应用中加入 Axum：

```toml
[dependencies]
axum = "0.8"
elura = "0.2.8"
```

创建普通 Axum `Router`，再通过 `.http(...)` 为它分配独立监听地址：

```rust
use axum::{Json, Router, routing::get};
use serde_json::{Value, json};

async fn application_status() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

fn application_router() -> Router {
    Router::new().route("/elura/status", get(application_status))
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

## HTTP 与长连接共用一次登录

`HttpAuthApi` 提供统一登录入口，同时保留有状态 ELR2 长连接：

| 端点 | 凭证 | 用途 |
| --- | --- | --- |
| `POST /elura/auth/login` | Provider 专用 JSON Credential | 签发 HTTP Access/Refresh Token；可同时签发首张 Gateway Ticket |
| `POST /elura/auth/refresh` | 一次性 Refresh Token | 轮换 Refresh Token 并签发新 Access Token |
| `POST /elura/game/session-ticket` | HTTP Bearer Access Token | 把已认证账户和角色选择换成短期、一次性的 Gateway 登录 Ticket |

Access Token 可重复用于普通 HTTP API。只给需要认证的路由挂接
`require_bearer`；公开回调和状态接口可以留在该中间件之外：

```rust
let payments = Router::new()
    .route("/elura/payments/orders", post(create_order))
    .route_layer(middleware::from_fn_with_state(
        auth_api.bearer_auth(),
        require_bearer,
    ));

let public_http = auth_api.router().merge(payments);

Gateway::new(gateway_config)
    .transport(TcpTransport::new(tcp_config)?)
    .http("0.0.0.0:8080", public_http)
    .run(admin_config)
    .await?;
```

支付等受保护 Handler 提取 `AuthenticatedHttp`，并通过 `require_scope(...)`
检查业务权限，不读取 ELR2 Session。长连接则使用一次性的 Gateway 登录 Ticket
认证，之后使用重连 Ticket；每条 ELR2 业务请求不需要再次携带 HTTP Access
Token。

自定义身份系统可以实现 `HttpLoginBackend`。同时启用 `gateway` 与 `identity`
后，`IdentityHttpBackend` 会把内置 `IdentityService` 以及密码、手机、OAuth2、
微信、抖音和 QuickSDK Provider 接入 `HttpAuthApi`。应用只需实现
`IdentityHttpPolicy`，负责授予 Scope，并验证所选角色属于已认证账户。注册和
账号绑定仍是显式流程，避免第三方一次性授权码被消费两次。

部署多个 HTTP 或 Gateway 副本时，每个实例必须使用相同的 Token 签名密钥、
Issuer 和 Audience，并注入 Redis 等共享 `ReplayStore`。这样任意 HTTP 副本都
能验证 Access Token，而 Refresh 轮换和 Gateway Ticket 在整个集群中仍只能使用
一次。负载均衡器可以把连续 HTTP 请求发到不同副本；WebSocket 与 WebTransport
长连接在断开前始终属于最初接收它的 Gateway，重连时可以落到其他副本。

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
elura = { version = "0.2.8", features = ["monolith"] }
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
- 管理 HTTP 应保持私有，不要通过公开应用 Router 再次暴露 `/elura/admin`、
  `/elura/debug` 或 `/elura/metrics`。
- 显式为应用 HTTP 配置认证、CORS、Body Limit、Timeout 与代理信任范围。
- `.http(...)` Helper 提供明文 HTTP。应将其放在可信 TLS 终止代理之后；需要
  直接终止 TLS 时，应运行应用自有 HTTPS Server。
