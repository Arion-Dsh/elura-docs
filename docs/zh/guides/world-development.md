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

## 测试

构建 Fluent World，再使用 `WorldServer::harness()` 返回的 Harness 测试 Handler，
无需打开 Socket：

```rust
let harness = World::new(WorldConfig::default())
    .route(GetPlayerProfile, get_player_profile)
    .build()?
    .harness();
```

其具体类型为 `elura::world::testing::WorldHarness`。类型化
`call(route, identity, request)` 会编码请求并解码响应。至少覆盖：

- 有效和无效 protobuf 载荷；
- 身份与 Realm 授权；
- 重复 Request ID；
- 超时和可重试错误；
- 事务回滚；
- 预期的 Push 消息。

发布应用变更前运行：

```bash
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```
