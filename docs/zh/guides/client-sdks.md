# 客户端协议 SDK

Elura 可以生成 Rust、C++20、C# 9 / .NET Standard 2.1（兼容 Unity 6.3 LTS）
和严格 TypeScript 本地协议库。它们实现公开的 Elura 客户端 ELR2 v2 契约，
客户端不需要重复手写二进制帧、保留路由和内置 Payload。

这些 SDK 是服务端所用 Wire Contract 的独立实现，并不是不同协议。同一个帧由
Rust、C++20、C# 或 TypeScript 编码时，会产生完全相同的字节。

## 生成协议库

在当前应用中生成全部语言：

```bash
elura init sdk --dir .
```

应用不需要全部语言时，只生成其中一种：

```bash
elura init sdk --language rust --dir .
elura init sdk --language cpp --dir .
elura init sdk --language csharp --dir .
elura init sdk --language typescript --dir .
```

该命令与其他脚手架一样支持 `--dry-run` 和 `--force`。默认保留已经自定义的
文件。

## 每套 SDK 包含什么

| 输出目录 | 运行环境 | 自带检查 |
| --- | --- | --- |
| `sdk/rust/` | 独立 Rust 2024 crate，集成 Tokio codec | Cargo 黄金向量测试 |
| `sdk/cpp/` | 无第三方依赖的 C++20 | CMake/CTest 黄金向量 |
| `sdk/csharp/` | C# 9 / .NET Standard 2.1，兼容 Unity 6.3 LTS | 在 .NET 9 上运行黄金向量 |
| `sdk/typescript/` | 浏览器与 Node.js 可用、无运行时依赖的严格 ES Module | Node 测试与类型检查 |

四套实现都包含帧编码、完整消息解码、TCP 流重组、保留路由、标准错误、认证与
重连 Payload 以及 Session Control protobuf 编码。Rust、TypeScript 与 C# 为
这些内置 Payload 提供 JSON Encoder/Decoder；C++ 提供对应的模型 Struct，由
应用选择的 JSON 库完成序列化。项目中还会包含
`proto/session_control.proto`，便于希望自行生成 protobuf 类型的应用使用。

标准错误模型包含可选的 `retry_after_ms`。收到可重试的 `REALM_FULL` 时，应回到
上层应用登录队列，或至少等待该延迟；不得对认证路由进行忙循环重试。

SDK 有意**不负责**打开 Socket 或分发应用路由。连接生命周期、续票调度、重连
退避、请求关联以及 `100+` 路由的消息编码仍由客户端负责。

## 上层最简用法

生成的 API 将协议帧与上层选择的传输分开。传输只需发送编码后的字节，并把收到
的字节交回 SDK。

::: code-group

```rust [Rust]
use elura_protocol::{Elr2Codec, EluraProtocol};
use tokio_util::codec::Framed;

let mut connection = Framed::new(stream, Elr2Codec::default());
let request = EluraProtocol::authenticate(next_request_id, login_ticket)?;
connection.send(request).await?;
```

```cpp [C++20]
#include <elura/elr2.hpp>

auto request = elura::Elr2Frame::request(
    100, next_request_id++, elura::to_bytes(R"({"x":10,"y":20})"));
send_bytes(elura::Elr2Codec::encode(request));

elura::Elr2StreamDecoder decoder;
decoder.append(received_chunk);
while (auto frame = decoder.next()) {
  handle(*frame);
}
```

```csharp [Unity / C# 9]
var request = EluraProtocol.Authenticate(nextRequestId++, loginTicket);
transport.Send(Elr2Codec.Encode(request));

decoder.Append(receivedChunk);
while (decoder.TryRead(out var frame))
{
    Handle(frame!);
}
```

```ts [TypeScript]
import { Elr2, EluraProtocol } from "@elura/protocol";

const request = EluraProtocol.authenticate(nextRequestId++, loginTicket);
socket.send(Elr2.encode(request));

socket.binaryType = "arraybuffer";
socket.onmessage = ({ data }) => handle(Elr2.decode(data as ArrayBuffer));
```

:::

Rust 的 `Elr2Codec` 可直接与 `tokio_util::codec::Framed` 集成。C++ 可直接接收
`std::vector`、`std::array` 和 `std::span` 字节区间。C# 内置认证与重连 JSON
编解码，并且不依赖 `System.Text.Json`。TypeScript 会自动把字符串 Payload
编码为 UTF-8，并直接接收 `ArrayBuffer` 或 `Uint8Array`。

## 静默重连流程

1. 解码路由 `1` 的认证响应，只安全保存 `response.reconnect.ticket`。
2. 根据 `response.reconnect.expires_in_seconds` 在过期前安排续票。
3. 保持连接时，Rust 调用 `EluraProtocol::renew_reconnect_ticket(...)`，
   TypeScript 调用 `EluraProtocol.renewReconnectTicket(...)`，C# 调用
   `EluraProtocol.RenewReconnectTicket(...)`。C++ 应用使用自己的 JSON 库序列化
   `ReconnectTicketRenewalRequest`，并发送到 `EluraRoutes::RenewReconnectTicket`。
4. 成功解码续票响应后，才用返回的新票据替换本地票据。
5. 断线后建立新传输连接，用保存的重连票据调用路由 `1`，再保存新认证响应中的
   重连票据。
6. 没有有效重连票据时，使用有效 HTTP Access Token 调用
   `/elura/game/session-ticket`；Access Token 过期时先通过
   `/elura/auth/refresh` 轮换。

票据本身是 Credential，不应写入日志或应用遥测。

## 传输契约

- TCP 与可靠 QUIC Stream 连续承载编码后的 ELR2 帧。读取结果可能是半个帧或
  多个帧，必须交给 SDK 提供的流式 Decoder。
- 每个 WebSocket 二进制 Message 恰好包含一个 ELR2 帧，并协商
  `elura.v2` WebSocket 子协议。QUIC 使用相同字符串作为 ALPN。
- 每个 UDP、WebTransport Datagram 或 QUIC Hybrid Datagram 恰好包含一帧完整
  ELR2。QUIC Hybrid 客户端必须使用与服务端相同的路由集合；框架路由和未指定
  路由仍使用可靠 Stream。对于 Best-effort 游戏消息，客户端需要实现序列、冗余、
  ACK 和恢复语义。
- WebTransport 可靠双向 Stream 使用与 TCP、QUIC 相同的字节流 Framing 规则。
- ELR2 不使用 WebSocket 文本 Message。
- Request ID 是客户端生成的非零 `u64`。TypeScript 可直接使用安全整数范围内的
  普通 `number` 作为计数器；需要完整无符号 64 位范围时也可传入 `bigint`。解码
  后的 Request ID 表示为 `bigint`。每次重试尝试都应分配新的 Request ID，以便
  区分迟到响应；业务 Operation ID 应放在应用 Payload 中并保持不变。

帧布局、保留路由流程、重试和兼容性规则见 [ELR2 协议](../concepts/protocol)。

生成的 SDK 处理 ELR2 字节，但不实现 Socket、客户端预测、远端插值或引擎实体
模型。这些接入边界见[实时游戏开发](./realtime-gameplay)。

## 验证生成代码

接入传输层之前，运行对应语言自带的检查：

::: code-group

```bash [Rust]
cargo test --manifest-path sdk/rust/Cargo.toml
```

```bash [C++]
cmake -S sdk/cpp -B sdk/cpp/build -DBUILD_TESTING=ON
cmake --build sdk/cpp/build
ctest --test-dir sdk/cpp/build --output-on-failure
```

```bash [C#]
dotnet run --project \
  sdk/csharp/Elura.Protocol.Tests/Elura.Protocol.Tests.csproj
```

```bash [TypeScript]
cd sdk/typescript
npm install
npm test
```

:::

这些检查在四种语言中使用同一组协议黄金向量。升级 Elura 并重新生成 SDK 后，
应再次运行它们。

## 应用消息

生成的协议库覆盖 Elura 保留的 Gateway 路由与 Wire Envelope。对于 ID 为 `120`
的 `inventory.equip_item` 等游戏路由，应在应用中定义 Request/Response protobuf，
使用常规语言工具生成消息类型，将 Request 编码进 ELR2 帧，再用相同 Schema
解码关联 Response 的 Payload。

Rust 服务端通过 `Route` 实现绑定 ID 与 protobuf 类型。客户端构建应通过生成的
应用代码或其他经过评审的单一事实来源使用相同 ID 和 Schema。低于 `100` 的 ID
属于运行时，不能分配给游戏命令。

## 安全升级

生成的 SDK 是上层应用中的源码，不是独立版本的包依赖。替换已自定义的文件前：

1. 使用新 CLI 运行 `elura init sdk --dry-run`；
2. 对比新模板与本地传输层接入；
3. 重新生成并运行黄金向量测试；
4. 在服务端要求新协议版本前，先发布兼容客户端。

Elura 在 `0.x` 阶段可能调整 API，而 Wire Protocol 版本会显式演进。发布客户端
时应锁定用于生成代码的 CLI 版本。
