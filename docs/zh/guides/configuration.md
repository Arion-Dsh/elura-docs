# 配置

Elura 配置结构可序列化，但加载和合并配置由应用负责。生成项目使用 JSON 保存
非密钥配置，使用环境变量注入密钥和部署覆盖值。

## 组合模式

```rust
use elura::adapters::discovery::DnsWorldDiscoveryConfig;
use elura::prelude::GatewayLaunchConfig;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct AppConfig {
    runtime: GatewayLaunchConfig,
    discovery: DnsWorldDiscoveryConfig,
}
```

应用应按顺序：

1. 加载非密钥配置。
2. 从环境变量或密钥管理器解析密钥。
3. 应用部署覆盖值。
4. 构造所选适配器。
5. 将适配器注入 Launcher。

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
| `listen` | `127.0.0.1:17000` |
| `max_connections` | `10000` |
| `max_connections_per_ip` | `100` |
| `max_payload` | `1048576` 字节 |
| `request_rate` / `request_burst` | `200` / `400` |
| `inbound_queue` / `response_queue` / `push_queue` | `64` / `64` / `64` |
| `idle_timeout` | 90 秒 |
| `authentication_timeout` | 10 秒 |
| `handler_timeout` | 5 秒 |
| `heartbeat_interval` | 30 秒 |
| `shutdown_timeout` | 10 秒 |
| 响应缓存 TTL / 容量 | 10 秒 / `128` |

认证路由 `1` 默认限制为每秒 5 个请求，Burst 为 5。对于昂贵的应用路由，应
添加 `route_rate_limits`。

## World 默认值

| 设置 | 默认值 |
| --- | ---: |
| `listen` | `127.0.0.1:18000` |
| `max_payload` | `1048576` 字节 |
| `max_connections` | `1024` |
| `max_in_flight_per_connection` | `64` |
| `handler_timeout` | 5 秒 |
| `shutdown_timeout` | 10 秒 |
| 幂等 TTL / 容量 | 30 秒 / `10000` |

应同时调整 Gateway 连接池容量与 World 并发限制。包含 `N` 条连接、每条允许
`M` 个并发命令的连接池，对每个目标最多提供 `N × M` 个排队或执行中的命令，
之后还会受到其他保护层限制。

## 管理服务配置

Gateway 和 World 的默认管理地址分别为 `127.0.0.1:17001` 与
`127.0.0.1:18001`。非回环监听地址必须配置至少 32 字节的管理令牌。健康、
就绪和版本接口无需认证；配置令牌后，指标、调试和管理操作使用
`Authorization: Bearer <token>`。

## TLS 与 Proxy Protocol

Gateway 和 World 的启动配置支持可选服务端证书与密钥文件。Gateway 到 World
的客户端 TLS 可以配置 CA、客户端证书与密钥以及期望的服务端名称。

仅对来自明确可信 CIDR 的流量启用 Proxy Protocol。运行时会验证代理来源，
并限制帧头大小和读取超时。不要直接信任来自公网的 Proxy Protocol。
