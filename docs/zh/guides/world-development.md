# World 模块与路由

World Handler 是游戏逻辑的主要扩展点。Handler 接收已认证的 `WorldContext`
和解码后的请求，然后返回类型化响应或 Elura 错误。

## 定义并注册路由

一个应用路由通过 `Route` 实现绑定稳定的 Wire ID、诊断名称、protobuf 请求和
protobuf 响应：

```rust
use prost::Message;
use elura::prelude::{Route, World, WorldConfig, WorldContext};

#[derive(Clone, PartialEq, Message)]
struct GetPlayerProfileRequest {}

#[derive(Clone, PartialEq, Message)]
struct GetPlayerProfileResponse {
    #[prost(int64, tag = "1")]
    user_id: i64,
    #[prost(string, tag = "2")]
    display_name: String,
}

struct GetPlayerProfile;

impl Route for GetPlayerProfile {
    const ID: u32 = 100;
    const NAME: &'static str = "player.get_profile";

    type Request = GetPlayerProfileRequest;
    type Response = GetPlayerProfileResponse;
}

async fn get_player_profile(
    context: WorldContext,
    _request: GetPlayerProfileRequest,
) -> elura::Result<GetPlayerProfileResponse> {
    Ok(GetPlayerProfileResponse {
        user_id: context.identity.user_id,
        display_name: format!("Player-{}", context.identity.user_id),
    })
}

fn world(config: WorldConfig) -> World {
    World::new(config).route(GetPlayerProfile, get_player_profile)
}
```

构建 World 前至少注册一个应用路由。路由 ID 必须大于等于 `100`，ID 和名称都
不能重复。`World::route` 使用关联的 protobuf 类型解码请求并编码成功响应。
Fluent 注册调用本身不会返回错误；无效配置和重复路由会由 `build()` 或 `run()`
返回。只有确实需要自行处理 Payload 字节的底层集成才应使用 `route_raw`。

## 返回业务错误

Handler 应直接返回 Elura 错误，不要把错误编码进成功响应：

```rust
if !player.can_afford(item.price) {
    return Err(elura::Error::business(
        "NOT_ENOUGH_GOLD",
        "金币不足",
    ));
}
```

Gateway 会把它发送为关联原 Request ID 的 ELR2 `Error` 帧。只有重复执行相同
操作安全时才使用 `Error::retryable(code, message)`。服务端主动发给客户端的事件
属于 `Push`，而不是 Error 帧。

## 组织模块

`WorldModule` 为业务模块提供名称、注册 Hook 和可选的异步生命周期：

```rust
use elura::world::{WorldModule, WorldModuleRegistry};

struct InventoryModule;

impl WorldModule for InventoryModule {
    fn name(&self) -> &str {
        "inventory"
    }

    fn register(&self, world: &mut WorldModuleRegistry<'_>) -> elura::Result<()> {
        // Register inventory handlers and middleware here.
        Ok(())
    }
}
```

配置 World 时安装模块：

```rust
let world = World::new(config).install(InventoryModule);
```

使用 CLI 生成起点：

```bash
elura init module --name inventory
elura init route --module inventory --name equip_item --id 120
```

应用仍需负责引入生成的模块并配置 protobuf 编译。

## Context 与中间件

`WorldContext` 携带身份、Session ID、Trace ID、Request ID、所有权和 Push 访问
能力等请求级数据。中间件可以实现日志、事务、玩家状态加载、授权或领域策略。

保持每个中间件职责单一。常见顺序为：

1. Trace 与结构化日志。
2. 授权与所有权检查。
3. 玩家状态缓存/加载。
4. 工作单元或事务。
5. 类型化业务 Handler。

只有在重复执行同一请求安全时才返回可重试错误。重试时复用 Request ID，让
幂等保护能够识别请求。

## 业务测试

构建 Fluent World，再使用 `WorldServer::harness()` 返回的 Harness 测试 Handler
和多步骤业务流程，无需打开 Socket：

```rust
use elura::world::testing::test_identity;

let harness = World::new(WorldConfig::default())
    .route(GetPlayerProfile, get_player_profile)
    .build()?
    .harness();

let client = harness.client(test_identity(42))?;
let response = client
    .call(GetPlayerProfile, GetPlayerProfileRequest {})
    .await?;
assert_eq!(response.user_id, 42);
```

`WorldHarness` 从 `elura::world::testing` 导出。`WorldTestClient` 会在多次调用间
保持同一 Identity 和 Session，自动分配 Request ID，并完成类型化路由消息的编解码。
因此登录、查询背包、装备物品、再次读取玩家状态等流程都可以直接写成普通 Rust
测试。需要指定 Session ID 时使用 `call_in_session`；只有协议与畸形 Payload 测试
才使用 `command_raw`。至少覆盖：

- 有效和无效 protobuf 载荷；
- 身份与 Realm 授权；
- 重复 Request ID；
- 超时和可重试错误；
- 事务回滚；
- 预期的 Push 消息。

### 可选 Transport 的全链路测试

当 p99 必须包含客户端 Transport、Ticket 认证、Gateway 队列、Gateway→World
连接池和 World 执行时，把 `elura-testkit` 添加为开发依赖：

```toml
[dev-dependencies]
elura-testkit = "0.2.5"
```

```rust
use elura_testkit::{
    FullStackBuilder, FullStackLoadConfig, WebSocketTestTransport,
    test_identity,
};

let harness = FullStackBuilder::loopback()?
    .route(GetPlayerProfile, get_player_profile)
    .start(WebSocketTestTransport::loopback()?)
    .await?;

let report = harness
    .load_scenario(
        FullStackLoadConfig::new(32, 1_000),
        |worker| test_identity(worker as i64 + 1),
        |client, _, _| async move {
            client.call(GetPlayerProfile, GetPlayerProfileRequest {}).await?;
            Ok(())
        },
    )
    .await?;

println!("transport={} p99={:?}", report.transport, report.operation_latency.p99);
harness.shutdown().await?;
```

内置 TCP 和 WebSocket Connector 共用同一个业务客户端。通过 `TestTransport` 和
`TestConnection` Trait，可以为 QUIC、WebTransport、UDP 与应用自定义 Transport
提供配对的 Gateway 端与客户端实现。不同 Transport 的样本不能合并计算一个
百分位。Loopback 结果是完整软件链路的基线；生产网络 p99 仍需从独立压测进程
请求已部署环境。

`WorldHarness` 有意不提供负载或百分位 API。它会绕过 Gateway 与 Transport
处理，因此其耗时只适合辅助单元测试诊断，不能作为有效的全链路 p99。

发布应用变更前运行：

```bash
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```
