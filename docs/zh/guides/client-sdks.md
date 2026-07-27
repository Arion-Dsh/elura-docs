# 客户端 SDK

Elura 为 Rust、C++20 和 C# / Unity 提供官方独立 SDK 仓库。三套 SDK 实现与
Gateway 相同的公开 ELR2 v2 Wire Contract，并独立于服务端仓库进行维护和版本
管理。

`elura` CLI 不再生成或安装客户端 SDK。请从对应语言的 GitHub 仓库获取：

| 语言 | 官方仓库 | 主要包 |
| --- | --- | --- |
| Rust | [`Arion-Dsh/elura-sdk-rust`](https://github.com/Arion-Dsh/elura-sdk-rust) | `elura-protocol`、`elura-client` |
| C++20 | [`Arion-Dsh/elura-sdk-cpp`](https://github.com/Arion-Dsh/elura-sdk-cpp) | `elura::protocol`、`elura::client_core`、各传输组件 |
| C# / Unity | [`Arion-Dsh/elura-sdk-csharp`](https://github.com/Arion-Dsh/elura-sdk-csharp) | `Elura.Protocol`、`Elura.Client.Core`、各传输包 |

## 从 GitHub 下载

::: code-group

```bash [Rust]
git clone https://github.com/Arion-Dsh/elura-sdk-rust.git
cd elura-sdk-rust
cargo test --workspace --all-features
```

```bash [C++20]
git clone https://github.com/Arion-Dsh/elura-sdk-cpp.git
cd elura-sdk-cpp
cmake -S . -B build -DBUILD_TESTING=ON
cmake --build build --parallel
ctest --test-dir build --output-on-failure
```

```bash [C# / Unity]
git clone https://github.com/Arion-Dsh/elura-sdk-csharp.git
cd elura-sdk-csharp
dotnet build Elura.sln -c Release
```

:::

生产构建应固定 Release Tag 或 Commit Hash，不要直接跟随 `main`。

## Rust

需要开箱即用的异步 Gateway Client 时，使用 `elura-client`：

```toml
[dependencies]
elura-client = { path = "../elura-sdk-rust/crates/elura-client" }
```

```rust
use elura_client::EluraClient;

let client = EluraClient::connect(gateway_address, login_ticket).await?;
let snapshot: Snapshot = client
    .request_protobuf(120, &MoveRequest { dx: 1, dy: 0 })
    .await?;
```

TCP 和 UDP 不需要可选 Feature。应用只在需要时启用 `websocket`、`quic` 或
`webtransport`。只需要 ELR2 Framing 与 Payload Helper 时，可直接使用
`elura-protocol`。

所有内置传输共用同一套 Session Driver，统一处理认证、心跳、请求关联、Push
分发、重连票据续期和自动重连。

## C++20

通过 CMake `FetchContent` 引入官方仓库：

```cmake
include(FetchContent)
FetchContent_Declare(
  elura_sdk
  GIT_REPOSITORY https://github.com/Arion-Dsh/elura-sdk-cpp.git
  GIT_TAG <release-tag-or-commit>
)
FetchContent_MakeAvailable(elura_sdk)

target_link_libraries(my_game PRIVATE elura::transport_tcp)
```

只链接应用实际使用的组件。例如 `elura::transport_tcp` 不会引入 WebSocket、
QUIC 或 WebTransport 代码；需要全部传输时仍可使用聚合目标
`elura::client`。

```cpp
#include <elura/client.hpp>

auto client = elura::EluraClient::connect(
    "127.0.0.1:17000",
    login_ticket_from_your_backend);

auto response = client
    .request(120, application_payload)
    .get();
```

## C# 与 Unity

从 GitHub Clone 仓库后，只引用应用需要的传输项目：

```xml
<ItemGroup>
  <ProjectReference Include="../elura-sdk-csharp/Elura.Transport.Tcp/Elura.Transport.Tcp.csproj" />
</ItemGroup>
```

```csharp
using Elura.Client;

await using var client = await EluraTcpClient.ConnectAsync(
    "gateway.example.com:17000",
    loginTicketFromYourBackend);

var response = await client.RequestAsync(120, applicationPayload);
```

WebSocket 使用 `Elura.Transport.WebSocket`。Unity 项目可以构建官方仓库，并只把
所需的 .NET Standard 2.1 DLL 复制到 `Assets/Plugins/Elura/`。准确的程序集列表
见 [C# SDK README](https://github.com/Arion-Dsh/elura-sdk-csharp#readme)。

## 重连与事件

Rust、C++ 和 C# 高层 Client 会自动：

1. 只保存最新的重连票据；
2. 在票据过期前续期；
3. 普通网络断开后，使用有界指数退避与 Jitter 自动重连；
4. 发布连接状态、Push、Session Control 和重新认证事件。

传输断开时，正在执行的应用请求不会自动重放，而是返回对应语言的
`RequestInterrupted` 错误，由应用判断该操作是否可以安全重试。

重连票据过期、已消费或被撤销时，Client 会发出
`ReauthenticationRequired`。应用应从自己的登录服务获取新的一次性 Login
Ticket，并传给 Client 的 `reauthenticate` 操作。普通网络抖动不需要用户重新
交互登录。

Login Ticket 和 Reconnect Ticket 都是 Credential，不应写入日志或应用遥测。

## ELR2 传输契约

三套 SDK 实现完全相同的 28 字节 ELR2 Header、网络字节序、帧类型、保留路由、
校验规则和 Payload 字节。跨语言黄金向量会验证逐字节兼容性。

- TCP 与可靠 QUIC Stream 连续承载 ELR2 帧。一次读取可能得到半帧或多个帧，
  必须使用 SDK 的流式 Decoder。
- 每个 WebSocket 二进制 Message 恰好包含一个 ELR2 帧，并协商 `elura.v2`
  子协议。
- 每个 UDP、WebTransport Datagram 或 QUIC Datagram 恰好包含一帧完整 ELR2。
- Request ID 是客户端生成的非零关联标识。每次传输尝试都应分配新的 Request
  ID。
- 默认 Payload 上限为 1 MiB，协议绝对上限为 64 MiB。大型资源应通过对象存储
  或应用层分片上传协议传输。

帧布局和保留路由流程见 [ELR2 协议](../concepts/protocol)。

## 应用消息

SDK 覆盖 Elura 保留的 Gateway 路由和 Wire Envelope。应用路由从 `100` 开始。
应用应定义 Request/Response protobuf，使用对应语言的常规工具生成消息类型，并
保证服务端与客户端使用相同 Route ID 和 Schema。

需要幂等保证的业务操作必须携带应用自有 Operation ID。ELR2 Request ID 只标识
一次传输尝试，不能作为持久化幂等键。

## 安全升级

SDK 是独立的版本化依赖，不再是 Elura 服务端项目中的生成源码。升级时：

1. 从对应官方 GitHub 仓库选择兼容的 SDK Release Tag 或 Commit；
2. 阅读该 SDK 的 Release Notes 和 README；
3. 重新运行协议、Client 与传输测试；
4. 在服务端要求新版 Wire Protocol 前先发布兼容客户端。

Elura 在 `0.x` 阶段可能调整 API，而 Wire Protocol 版本会显式演进。
