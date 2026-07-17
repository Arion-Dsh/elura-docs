# 配置

Elura 配置结构可序列化，但加载和合并配置由应用负责。生成项目使用 JSON 保存
非密钥配置，使用环境变量注入密钥和部署覆盖值。

## 组合模式

```rust
use elura::adapters::discovery::DnsWorldDiscoveryConfig;
use elura::prelude::{AdminServerConfig, GatewayConfig, TcpConfig};

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: GatewayConfig,
    admin: AdminServerConfig,
    tcp: TcpConfig,
    discovery: DnsWorldDiscoveryConfig,
}
```

应用应按顺序：

1. 加载非密钥配置。
2. 从环境变量或密钥管理器解析密钥。
3. 应用部署覆盖值。
4. 构造所选适配器。
5. 构造传输与适配器，并注入 `Gateway`、`World` 或 `Monolith`。

票据密钥和内部令牌等字段会被 Serde 跳过，避免意外写入序列化配置。

## Duration 格式

Serde 将 `std::time::Duration` 编码为秒和纳秒：

```json
{ "secs": 5, "nanos": 0 }
```

两个字段均为整数，大多数超时必须大于零。

## Gateway 默认值

`GatewayConfig` 提供安全的开发默认值：

| 设置 | 默认值 |
| --- | ---: |
| `max_connections` | `10000` |
| `max_connections_per_ip` | `100` |
| `max_payload` | `1048576` 字节 |
| `request_rate` / `request_burst` | `200` / `400` |
| `inbound_queue` / `response_queue` / `push_queue` | `64` / `64` / `64` |
| `idle_timeout` | 90 秒 |
| `authentication_timeout` | 10 秒 |
| `ticket.login_ttl` | 60 秒 |
| `ticket.reconnect_ttl` | 30 分钟 |
| `handler_timeout` | 5 秒 |
| `heartbeat_interval` | 30 秒 |
| `shutdown_timeout` | 10 秒 |
| 响应缓存 TTL / 容量 | 10 秒 / `128` |

认证路由 `1` 默认限制为每秒 5 个请求，Burst 为 5。对于昂贵的应用路由，应
添加 `route_rate_limits`。

票据配置显式区分登录与重连有效期：

```json
{
  "ticket": {
    "issuer": "game-login",
    "audience": "game-gateway",
    "login_ttl": { "secs": 60, "nanos": 0 },
    "reconnect_ttl": { "secs": 1800, "nanos": 0 }
  }
}
```

上层登录服务与所有 Gateway 必须使用相同的密钥、Issuer、Audience 和有效期。
密钥被 Serde 跳过，因此需要单独注入。

客户端监听地址不再属于 `GatewayConfig`。每种传输拥有自己的配置并显式安装。
`TcpConfig` 默认监听 `127.0.0.1:17000`，同时包含 TCP Keepalive、TLS 握手、
待处理握手数、证书与 Proxy Protocol 设置。WebSocket 和 QUIC 使用各自的配置类型。

## World 默认值

| 设置 | 默认值 |
| --- | ---: |
| `listen` | `127.0.0.1:18000` |
| `max_payload` | `1048576` 字节 |
| `max_connections` | `1024` |
| `max_in_flight_per_connection` | `64` |
| `handler_timeout` | 5 秒 |
| `shutdown_timeout` | 10 秒 |

应同时调整 Gateway 连接池容量与 World 并发限制。包含 `N` 条连接、每条允许
`M` 个并发命令的连接池，对每个目标最多提供 `N × M` 个排队或执行中的命令，
之后还会受到其他保护层限制。

## 管理服务配置

`AdminServerConfig` 与 Gateway/World 运行时配置分离，并传给 `.run(admin)`。
生成项目中 Gateway/单体默认使用 `127.0.0.1:17001`，World 默认使用
`127.0.0.1:18001`。非回环监听地址必须配置至少 32 字节的管理令牌。健康、
就绪和版本接口无需认证；配置令牌后，指标、调试和管理操作使用
`Authorization: Bearer <token>`。

## TLS 与 Proxy Protocol

`TcpConfig` 和 `QuicConfig` 保存面向客户端的证书设置，`WorldConfig` 保存独立
World 的服务端证书。Gateway 到 World 的客户端 TLS 仍由
`GatewayConfig::world_tls` 配置，可包含 CA、客户端证书与密钥以及期望的服务端名称。

仅对来自明确可信 CIDR 的流量启用 Proxy Protocol。运行时会验证代理来源，
并限制帧头大小和读取超时。不要直接信任来自公网的 Proxy Protocol。

多传输组合见[客户端传输](./transports)，受生命周期监管的 Axum Router 见
[应用 HTTP 服务](./application-http)。
