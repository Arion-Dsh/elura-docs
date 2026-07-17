# 客户端传输

客户端传输是 Gateway 承载 ELR2 游戏会话的网络端点。TCP、WebSocket、QUIC 与
自定义传输最终进入同一套 Session 引擎；它们不同于[应用 HTTP](./application-http)
和私有管理服务。

不要用 `Gateway::http` 挂载 ELR2 WebSocket。内置 WebSocket 端点是
`GatewayTransport`，与 TCP、QUIC 共享认证、限制、路由、Push 和优雅停机。

## 安装传输

`GatewayConfig` 与具体传输无关。Gateway 在 `build()` 或 `run()` 前至少要安装
一个传输，也可以同时安装多个端点：

```rust
use elura::prelude::*;

let tcp = TcpTransport::new(tcp_config)?;
let mut gateway = Gateway::new(gateway_config).transport(tcp);

let mut websocket = WebSocketConfig::default();
websocket.listen = "0.0.0.0:17002".parse().expect("static address");
websocket.allowed_origins = vec!["https://game.example.com".into()];
gateway = gateway.transport(websocket);

if let Some(quic) = quic_config {
    gateway = gateway.transport(quic);
}

gateway
    .world_discovery(discovery)
    .run(admin_config)
    .await?;
```

每次 `.transport(...)` 注册一个独立监听端点。所有端点最终进入同一个
`GatewayServer`，因此连接限制、已认证 Session、防重放、Interceptor、World
路由、Push 和停机过程都是共享的。

## 内置传输

| 传输 | 安装值 | 默认地址 | 主要设置 |
| --- | --- | --- | --- |
| ELR2/TCP | `TcpTransport::new(TcpConfig)?` | `127.0.0.1:17000` | Keepalive、TLS、待处理握手、Proxy Protocol |
| ELR2/WebSocket | `WebSocketConfig` | `127.0.0.1:17002` | Path、子协议、Origin、TLS、可信代理 |
| ELR2/QUIC | `QuicConfig` | `127.0.0.1:17003` | 证书、私钥、ALPN、空闲/握手超时 |

### TCP

TCP 配置可以序列化。生成项目将其放在顶层 `tcp` 对象中，而不是 `runtime` 内：

```json
{
  "runtime": {},
  "tcp": {
    "listen": "0.0.0.0:17000",
    "keepalive": { "secs": 30, "nanos": 0 },
    "tls_handshake_timeout": { "secs": 5, "nanos": 0 },
    "max_pending_handshakes": 1024,
    "tls": null,
    "proxy_protocol": null
  }
}
```

注册端点前先构造传输：

```rust
let tcp = TcpTransport::new(app.tcp)?;
let gateway = Gateway::new(app.runtime).transport(tcp);
```

只对明确可信的代理 CIDR 启用 Proxy Protocol。TCP TLS 与 Proxy Protocol 属于
`TcpConfig` 或对应的 `TcpTransport` Builder 方法，而不是 `GatewayConfig`。

### WebSocket

`WebSocketConfig` 默认路径为 `/elura/game`，并要求 `elura.v2` 子协议。未配置
`allowed_origins` 时，浏览器 Origin 必须与请求 Host 匹配。省略 `Origin` 的非
浏览器客户端需要设置 `allow_missing_origin = true`；只应为明确支持的客户端开启。

该配置应在代码中构造。如果需要放入 JSON，请定义应用自有的可反序列化设置类型，
校验后再把值映射到 `WebSocketConfig`。

### QUIC

QUIC 始终使用 TLS 1.3。可通过证书和私钥路径构造 `QuicConfig`，也可以反序列化
生成项目使用的可选顶层 `quic` 对象。默认 ALPN 是 `elura.v2`，一个 ELR2
Session 使用客户端发起的第一条双向 Stream。

## 自定义传输

自定义端点需要同时实现 `GatewayTransport` 与 `GatewayTransportListener`。
Listener 返回客户端地址和实现 Tokio `AsyncRead + AsyncWrite` 的 I/O；Elura 会在
该字节流上应用正常的 ELR2 Framing 与 Session 引擎。

传输实现应负责 `validate`、`bind` 以及有界的 Accept/握手过程。应用仍使用同一
入口安装：

```rust
let gateway = Gateway::new(config).transport(MyTransport::new(settings)?);
```

自定义传输 Crate 通常还需依赖 `async-trait = "0.1"` 与 `tokio`。关联 Listener
及 I/O Bound 的完整要求见 `GatewayTransport` 和 `GatewayTransportListener`
Rustdoc。

## 监听规则

- 至少安装一个传输。
- 客户端传输、应用 HTTP 与管理 HTTP 必须使用互不冲突的监听地址。
  `0.0.0.0:17000` 会与所有使用 `17000` 端口的监听冲突。
- 无效传输设置与监听冲突由 `build()` 或 `run()` 返回；Fluent 注册不会 Panic。
- TCP、WebSocket 与 QUIC 分别拥有自己的客户端 TLS 设置。
- 所有已注册传输都随 Gateway 生命周期停止并排空。
