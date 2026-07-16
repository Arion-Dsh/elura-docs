# 客户端协议 SDK

Elura 可以生成 C++17、.NET 8/C# 和 TypeScript 本地协议库。它们实现公开的
Gateway-to-client ELR2 v2 契约，客户端不需要重复手写二进制帧、保留路由和
内置 Payload。

这些 SDK 是 Rust `elura_core::protocol::FrameCodec` 所用 Wire Contract 的其他
语言实现，并不是不同协议。同一个帧由 Rust、C++17、C# 或 TypeScript 编码时，
会产生完全相同的字节。

## 生成协议库

在当前应用中生成全部语言：

```bash
elura init sdk --dir .
```

应用不需要全部语言时，只生成其中一种：

```bash
elura init sdk --language cpp --dir .
elura init sdk --language csharp --dir .
elura init sdk --language typescript --dir .
```

该命令与其他脚手架一样支持 `--dry-run` 和 `--force`。默认保留已经自定义的
文件。

## 每套 SDK 包含什么

| 输出目录 | 运行环境 | 自带检查 |
| --- | --- | --- |
| `sdk/cpp/` | 无第三方依赖的 C++17 | CMake/CTest 黄金向量 |
| `sdk/csharp/` | 无第三方依赖的 .NET 8 类库 | 黄金向量可执行程序 |
| `sdk/typescript/` | TypeScript ES Module | Node 测试与类型检查 |

三套实现都包含帧编码、完整消息解码、TCP 流重组、保留路由、标准错误、Gateway
内置 Payload 与 Session Control protobuf 编码。项目中还会包含
`proto/session_control.proto`，便于希望自行生成 protobuf 类型的应用使用。

SDK 有意**不负责**打开 Socket 或分发应用路由。连接生命周期、重连策略、请求
关联以及 `100+` 路由的消息编码仍由客户端负责。

## 传输契约

- TCP 与 QUIC Stream 连续承载编码后的 ELR2 帧。读取结果可能是半个帧或多个
  帧，必须交给 SDK 提供的流式 Decoder。
- 每个 WebSocket 二进制 Message 恰好包含一个 ELR2 帧，并协商
  `elura.v2` WebSocket 子协议。QUIC 使用相同字符串作为 ALPN。
- ELR2 不使用 WebSocket 文本 Message。
- Request ID 是客户端生成的非零 `u64`。TypeScript SDK 使用 `bigint`，避免
  丢失完整整数范围。

帧布局、保留路由流程、重试和兼容性规则见 [ELR2 协议](../concepts/protocol)。

## 验证生成代码

接入传输层之前，运行对应语言自带的检查：

::: code-group

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

这些检查在三种语言中使用同一组协议黄金向量。升级 Elura 并重新生成 SDK 后，
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
