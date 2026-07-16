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
客户端必须协商 `elura.v2` 子协议。QUIC 同样使用 `elura.v2` 作为 ALPN。协议
不支持 WebSocket 文本 Message。

Elura 可以生成对应的 C++17、C# 与 TypeScript 编解码器。接入边界和不同传输
方式的检查见[客户端协议 SDK](../guides/client-sdks)。

## 所有语言使用同一套协议

Rust 的 `Frame` 与 `FrameCodec` 是 ELR2 的参考实现，而不是 Rust 专用传输协议。
生成的 C++17、C# 和 TypeScript SDK 会编码完全相同的 28 字节帧头、整数字节序、
帧类型、校验规则和 Payload 字节。跨语言黄金向量会验证逐字节兼容性。

存在非 Rust 客户端时，不要把 ELR2 换成原生 Struct 布局、`bincode` 等 Rust
专用序列化格式；这些格式没有稳定的跨语言 ABI。ELR2 提供语言无关的帧封装，
protobuf 提供语言无关的应用请求与响应 Payload。

## 路由范围

| 路由 | 含义 |
| ---: | --- |
| `1` | 认证 |
| `2` | 心跳 |
| `3` | 重连 |
| `4` | 会话控制 |
| `5..99` | 保留给未来运行时功能 |
| `100+` | 应用路由 |

不要为应用分配低于 `100` 的 ID。Rust 服务端的每个类型化应用路由都实现
`Route`，在一处绑定 ID、诊断名称、protobuf 请求和 protobuf 响应。
`WorldBuilder::register` 会在启动时拒绝重复的 ID 和名称。客户端必须使用相同的
路由 ID 与 protobuf Schema。

## 应用 Payload 与错误

类型化应用 `Request` 和成功 `Response` 的 Payload 是应用声明的 protobuf
消息。失败请求使用类型 `4`，Payload 是规范的 UTF-8 JSON 错误信封：

```json
{
  "code": "NOT_ENOUGH_GOLD",
  "message": "金币不足",
  "retryable": false
}
```

`code` 只能包含大写 ASCII 字母、数字和下划线，最长 64 字节；`message` 最长
1024 字节。Error 帧保留原请求的 Route、Request ID 和 Sequence。Error 是请求
结果，因此 Request ID 不能为零；服务端主动通知应使用 `Push`。

## 认证流程

```text
客户端                         Gateway                         World
  │                               │                              │
  ├── 请求 route=1, ticket ─────>│                              │
  │                               ├── 验证签名与 Claims          │
  │                               ├── 检查重放与准入             │
  │<── 响应 session+identity ────┤                              │
  │                               │                              │
  ├── 请求 route>=100 ──────────>│                              │
  │                               ├── 已认证命令 ───────────────>│
  │                               │<── 结果或错误 ───────────────┤
  │<── 响应或错误 ───────────────┤                              │
```

未认证会话必须在 Gateway 的 `authentication_timeout` 内完成认证。普通请求还会
受到全局和按路由令牌桶、有界队列、载荷限制、Handler 超时和空闲超时约束。

## Request ID 与重试

Request ID 由客户端生成，用于关联请求，且必须非零。Gateway 为近期完成的请求
保留有界响应缓存，World 保留有界幂等缓存。重试应在配置的 TTL 内复用相同的
Request ID 和路由。不要把这些内存缓存当作持久化的 Exactly-once 交付保证。

## 兼容性

编解码器会拒绝未知 Magic、不支持的版本、未知类型、无效 Request ID、过大载荷
或错误的 Message 长度。协议版本必须显式演进；不要在保留版本 `2` 的同时改变
现有字段语义。
