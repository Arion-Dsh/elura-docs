# 管理 HTTP API

管理 API 是私有接口，不应通过公开游戏 Ingress 暴露。除非另有说明，受保护
端点接受：

```http
Authorization: Bearer <admin-token>
```

如果回环监听地址未配置令牌，本机可以无 Header 访问受保护端点。非回环监听
地址没有令牌时无法启动。

## 诊断

| 方法与路径 | 认证 | 响应 |
| --- | --- | --- |
| `GET /healthz` | 无 | `204` |
| `GET /readyz` | 无 | `204`，或 `503` 加原因 |
| `GET /version` | 无 | 版本/组件 JSON |
| `GET /metrics` | 受保护 | Prometheus 文本 |
| `GET /debug/stats` | 受保护 | 运行时统计 JSON |
| `GET /debug/backend` | 受保护 | Gateway 保护状态 JSON 或 `404` |
| `GET /debug/routes` | 受保护 | World 路由 JSON 或 `404` |

## 强制退出

`POST /admin/sessions/force-logout`

```json
{
  "region_id": 1,
  "realm_id": 1,
  "user_id": 42,
  "reason": "operator request"
}
```

响应包含投递数量：

```json
{ "delivered": 1 }
```

## 撤销账户版本

`POST /admin/sessions/revoke-account-version`

```json
{
  "region_id": 1,
  "realm_id": 1,
  "user_id": 42,
  "minimum_generation": 8,
  "reason": "credentials rotated"
}
```

## 用户封禁

创建或替换限时封禁：

`PUT /admin/admission/user-bans`

```json
{
  "region_id": 1,
  "realm_id": 1,
  "user_id": 42,
  "ttl_ms": 3600000,
  "reason": "abuse"
}
```

解除封禁：

```text
DELETE /admin/admission/user-bans/{region_id}/{realm_id}/{user_id}
```

## IP 封禁

`PUT /admin/admission/ip-bans/{ip}`

```json
{
  "ttl_ms": 600000,
  "reason": "connection flood"
}
```

使用 `DELETE /admin/admission/ip-bans/{ip}` 解除。

## 维护模式

`PUT /admin/admission/maintenance`

```json
{
  "ttl_ms": 900000,
  "reason": "database maintenance"
}
```

使用 `DELETE /admin/admission/maintenance` 清除。

## 状态码

| 状态码 | 含义 |
| --- | --- |
| `204` | 修改成功，无响应体 |
| `400` | JSON/配置无效，包括 `ttl_ms` 为零 |
| `401` | Bearer Token 缺失或无效 |
| `404` | 可选 Gateway/准入能力未挂接 |
| `503` | 依赖不可用、超时或队列已满 |
| `500` | 其他内部故障 |

所有修改端点都属于敏感运维操作。上层控制面应记录已认证的操作员和原因；运行时
Bearer Token 本身不提供用户级审计身份。

