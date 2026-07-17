# 可观测性与运维

对 `Gateway`、`World` 或 `Monolith` 调用 `run(AdminServerConfig)` 会在游戏服务旁
启动私有 HTTP 管理服务。使用独立端口可以避免运维流量进入 ELR2 协议路径。

## Probe 端点

| 端点 | 认证 | 成功响应 | 含义 |
| --- | --- | --- | --- |
| `GET /elura/healthz` | 无 | `204` | 进程和管理循环存活 |
| `GET /elura/readyz` | 无 | `204` | 进程可接收新流量 |
| `GET /elura/version` | 无 | `200` JSON | Elura 版本、运行时、组件和实例 |

Readiness 失败返回 `503` 和简短原因。使用 Readiness 将进程摘除流量；只有在
进程真正卡死时才通过 Liveness 重启。

## 指标与诊断

配置令牌后，指标和调试端点需要 Bearer Token：

```bash
curl -H "Authorization: Bearer $APP_ADMIN_TOKEN" \
  http://127.0.0.1:17001/elura/metrics
```

| 端点 | 用途 |
| --- | --- |
| `GET /elura/metrics` | Prometheus 文本格式 |
| `GET /elura/debug/stats` | 运行时计数器与当前活动 |
| `GET /elura/debug/backend` | Gateway 熔断/并发状态，可能返回 `404` |
| `GET /elura/debug/routes` | 已注册的 World 路由元数据，可能返回 `404` |

所有 JSON 和调试响应都使用 `Cache-Control: no-store`。

## 重要 Gateway 信号

- 活跃连接数与累计连接数；
- 已认证会话；
- 请求与被拒绝请求；
- 故障、Push 与 Push 失败；
- 活跃 World 命令；
- 并发保护与熔断拒绝；
- 短暂后端故障与熔断开启次数。

`elura_gateway_sessions_authenticated` 是单 Gateway 的 Session Gauge。跨副本求和
适合观察连接负载，但不能当作去重玩家数展示。玩家侧在线人数应读取
`OnlineStatsReader::stats(region_id, realm_id)`，其中 `user_count` 按
`user_id` 去重。参见[在线状态](/zh/adapters/online)。

## 重要 World 信号

- 活跃命令数与累计命令数；
- 成功命令；
- 业务故障与内部故障；
- 超时与被捕获的 Handler Panic；
- 路由就绪状态与 Registrar 健康状态。

应针对速率和持续状态告警，而不是单次计数增长。熔断器持续打开、内部故障持续
增长或所有实例 Readiness 失败都需要立即处理。

## 管理操作

应用挂接 Gateway 管理能力后，运维人员可以强制退出、撤销账户版本、封禁用户
或 IP，以及启用维护模式。准入策略修改接口还需要 `AdmissionAdmin` 实现。
未挂接的可选能力返回 `404`。

请求体和状态码见[管理 HTTP API](/zh/reference/admin-api)。

## 优雅停机

应用侧 `run` 方法监听平台终止信号，停止接收工作并协调 Gateway、World 和管理
任务。Kubernetes 的终止宽限期应大于配置的 Shutdown Timeout，并为 Endpoint
移除留出时间。短暂的 `preStop` 延迟可以减少 Endpoint 传播期间的新连接。

## 压力测试

Workspace 包含 `elura-load` TCP 压测工具。它会创建签名测试 Ticket、认证每个
连接、请求指定应用路由，并输出连接、认证、请求延迟、吞吐与错误计数。

```bash
export ELURA_LOAD_TICKET_KEY='替换为与-gateway-相同的-32-字节密钥'
cargo run -p elura-load -- \
  --address 127.0.0.1:17000 \
  --connections 1000 \
  --requests 100 \
  --route 120
```

运行 `cargo run -p elura-load -- --help` 查看 Payload、超时、爬升、Identity
与 Ticket Claim 选项。Ticket Key、Issuer、Audience、Region 和 Realm 必须与
目标 Gateway 一致。请使用独立的非生产环境；每个 Worker 都代表一名已认证用户，
并会调用指定路由。

需要可复现的分布式压测时，`tools/elura-perf/compose.yml` 会启动 HAProxy、两个
Gateway、一个 World、Redis 和压测工具。由于所有连接都来自同一个容器，该环境
有意关闭了共享的来源 IP 请求限制，不应把这项覆盖复制到常规部署配置。

## 事故排查

1. 检查受影响实例的 `/elura/healthz`、`/elura/readyz` 和 `/elura/version`。
2. 重启前保存 `/elura/debug/stats` 与 `/elura/debug/backend`。
3. 对比 Gateway 后端错误与 World 命令故障和延迟。
4. 检查发现到的目标与 World Readiness。
5. 分别检查 Redis、SQL 和 Kubernetes 适配器健康状态。
6. 在线状态异常时，对比应用投影与 `OnlineDirectory` 存活 Lease，并检查 Redis
   TTL 和续租行为。
7. 确认发布没有以不兼容方式更改路由 ID、密钥、Issuer/Audience、TLS 或内部令牌。
