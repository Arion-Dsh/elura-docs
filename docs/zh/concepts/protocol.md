# ELR2 协议

ELR2 是 Elura 用于客户端流量和内部命令流量的二进制帧协议。所有整数字段均按
网络字节序（大端）编码。

## 帧布局

每个帧都以固定的 28 字节帧头开始：

| 偏移 | 大小 | 字段 | 说明 |
| ---: | ---: | --- | --- |
| 0 | 4 | Magic | `0x454C5232`，ASCII `ELR2` |
| 4 | 2 | Version | `2` |
| 6 | 1 | Kind | 请求 `1`、响应 `2`、Push `3`、错误 `4` |
| 7 | 1 | Flags | 当前必须为 `0`，其他值会被拒绝 |
| 8 | 4 | Route | 运行时或应用路由 ID |
| 12 | 8 | Request ID | 请求、响应和错误必须非零；Push 为零 |
| 20 | 4 | Sequence | 会话排序与重连序号 |
| 24 | 4 | Payload length | 帧头之后的字节数 |
| 28 | N | Payload | 帧编解码器视为不透明数据，通常是 protobuf 或 JSON |

默认最大载荷为 1 MiB。`FrameCodec` 允许配置到 64 MiB，但应用应尽量使用更小
的上限。

## 帧类型

- **Request** 发起操作，必须使用非零 Request ID。
- **Response** 使用请求的 Request ID、路由和序号进行关联。
- **Push** 由服务端发起，Request ID 必须为 `0`。
- **Error** 与请求关联，携带序列化错误信封。

WebSocket 传输中，每个二进制 WebSocket Message 必须恰好包含一个 ELR2 帧，
客户端必须协商 `elura.v2` 子协议。QUIC 同样使用 `elura.v2` 作为 ALPN。可靠
QUIC 流量使用客户端发起的第一条双向 Stream；Hybrid 模式下，指定的应用路由让
每个 QUIC Datagram 承载一帧完整 ELR2，框架路由和未指定路由仍使用 Stream。
协议不支持 WebSocket 文本 Message。

官方 Rust、C++20 与 C# SDK 分别由独立 GitHub 仓库维护。下载地址、接入边界和
不同传输方式的检查见[客户端 SDK](../guides/client-sdks)。

## 所有语言使用同一套协议

服务端 Rust 的 `Frame` 与 `FrameCodec` 是 ELR2 的参考实现，而不是 Rust 专用
传输协议。官方 Rust、C++20 和 C# SDK 会编码完全相同的 28 字节帧头、整数
字节序、帧类型、校验规则和 Payload 字节。跨语言黄金向量会验证逐字节兼容性。

存在非 Rust 客户端时，不要把 ELR2 换成原生 Struct 布局、`bincode` 等 Rust
专用序列化格式；这些格式没有稳定的跨语言 ABI。ELR2 提供语言无关的帧封装，
protobuf 提供语言无关的应用请求与响应 Payload。

## 路由范围

| 路由 | 含义 |
| ---: | --- |
| `1` | 认证 |
| `2` | 心跳 |
| `3` | 轮换当前重连票据 |
| `4` | 会话控制 |
| `5..99` | 保留给未来运行时功能 |
| `100+` | 应用路由 |

不要为应用分配低于 `100` 的 ID。Rust 服务端的每个类型化应用路由都实现
`Route`，在一处绑定 ID、诊断名称、protobuf 请求和 protobuf 响应。
`World::route` 会记录重复的 ID 和名称，并由 `build()` 或 `run()` 返回错误。
可复用 `WorldModule` 通过 `WorldModuleRegistry::route` 注册路由。客户端必须使用
相同的路由 ID 与 protobuf Schema。

## 应用 Payload 与错误

类型化应用 `Request` 和成功 `Response` 的 Payload 是应用声明的 protobuf
消息。失败请求使用类型 `4`，Payload 是规范的 UTF-8 JSON 错误信封：

```json
{
  "code": "REALM_FULL",
  "message": "所选 Realm 已满",
  "retryable": true,
  "retry_after_ms": 1000
}
```

`code` 只能包含大写 ASCII 字母、数字和下划线，最长 64 字节；`message` 最长
1024 字节。`retry_after_ms` 是可选字段，表示 `REALM_FULL` 等可重试错误建议的
最短等待时间；字段缺失或为零时客户端也不得忙循环重试。Error 帧保留原请求的
Route、Request ID 和 Sequence。Error 是请求结果，因此 Request ID 不能为零；
服务端主动通知应使用 `Push`。

## 认证流程

```text
客户端                         Gateway                         World
  │                               │                              │
  ├── 请求 route=1, ticket ─────>│                              │
  │                               ├── 验证签名与 Claims          │
  │                               ├── 检查重放与准入             │
  │<── 响应 session+identity     │                              │
  │    + reconnect ticket ───────┤                              │
  │                               │                              │
  ├── 请求 route>=100 ──────────>│                              │
  │                               ├── 已认证命令 ───────────────>│
  │                               │<── 结果或错误 ───────────────┤
  │<── 响应或错误 ───────────────┤                              │
```

未认证会话必须在 Gateway 的 `authentication_timeout` 内完成认证。普通请求还会
受到全局和按路由令牌桶、有界队列、载荷限制、Handler 超时和空闲超时约束。

认证路由 `1` 接受一次性的登录票据或重连票据：

```json
{ "ticket": "signed-ticket" }
```

响应包含 `session_id`、`identity` 和下一张重连票据：

```json
{
  "session_id": "0195d8f4-48e8-7c42-b91c-c5d42b055cf5",
  "identity": {
    "account_id": 10,
    "user_id": 20,
    "region_id": 1,
    "realm_id": 2,
    "generation": 1
  },
  "reconnect": {
    "ticket": "signed-reconnect-ticket",
    "expires_in_seconds": 1800
  }
}
```

路由 `3` 只允许已认证会话调用。请求必须携带当前重连票据；Gateway 消费它后
返回替代票据：

```json
{ "ticket": "current-reconnect-ticket" }
```

```json
{
  "ticket": "replacement-reconnect-ticket",
  "expires_in_seconds": 1800
}
```

真正的断线重连会建立新传输连接，并把保存的重连票据发送到路由 `1`；未认证
连接不能调用路由 `3`。

## Request ID 与重试

Request ID 由客户端生成，用于关联请求，且必须非零。它标识一次传输尝试：响应或
错误会回显 Request ID，因此客户端使用新 ID 重试后可以拒绝迟到的旧结果。
Gateway 不缓存或重放应用响应；每个通过校验的重试都会进入 World。

需要幂等保证的业务操作必须在 protobuf Payload 中携带稳定的应用 Operation ID。
同一操作的所有尝试保持该 ID 不变，并通过共享持久化存储和事务唯一约束执行防重。
不要用连接范围内的 Request ID 或 Sequence 代替业务幂等键。

## 兼容性

编解码器会拒绝未知 Magic、不支持的版本、未知类型、无效 Request ID、过大载荷
或错误的 Message 长度。协议版本必须显式演进；不要在保留版本 `2` 的同时改变
现有字段语义。
