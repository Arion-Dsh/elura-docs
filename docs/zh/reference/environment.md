# 环境变量

这些名称属于生成的上层应用，Elura 本身不会读取环境变量。

## 密钥

| 变量 | 使用方 | 说明 |
| --- | --- | --- |
| `APP_TICKET_KEY` | Gateway、单体 | 票据签发/验证密钥，至少 32 字节 |
| `APP_INTERNAL_TOKEN` | 拆分 Gateway 与 World | 私有命令认证，至少 32 字节且不同于票据密钥 |
| `APP_ADMIN_TOKEN` | 非回环管理监听 | 指标、调试和管理操作 Bearer Token，至少 32 字节 |

## 配置路径

| 变量 | 默认值 |
| --- | --- |
| `APP_GATEWAY_CONFIG` | `config/gateway.json` |
| `APP_WORLD_CONFIG` | `config/world.json` |
| `APP_MONOLITH_CONFIG` | `config/monolith.json` |

## 监听地址覆盖

| 变量 | 示例 |
| --- | --- |
| `APP_GATEWAY_ADDR` | `0.0.0.0:17000` |
| `APP_GATEWAY_ADMIN_ADDR` | `0.0.0.0:17001` |
| `APP_WORLD_LISTEN` | `0.0.0.0:18000` |
| `APP_WORLD_ADMIN_ADDR` | `0.0.0.0:18001` |
| `APP_INSTANCE_ID` | Pod 名称或稳定进程标识 |

## 部署与应用示例

| 变量 | 用途 |
| --- | --- |
| `ELURA_IMAGE` | Docker Compose 镜像覆盖值，默认为 `elura-game:dev` |
| `DATABASE_URL` | 应用持久化预留示例 |
| `ACCOUNT_SERVICE_URL` | 账户服务预留示例 |
| `CHARACTER_SERVICE_URL` | 角色服务预留示例 |
| `APP_REDIS_CLUSTER_NODES` | 应用自有 Redis Seed 列表示例 |

生成的二进制文件不会读取这些预留业务/适配器变量，除非应用把它们加入
`AppConfig`。

## Shell 用法

```bash
set -a
. config/elura.env
set +a
cargo run --bin gateway
```

生产环境应通过平台密钥机制注入。不要把密钥直接写入命令参数、镜像、ConfigMap
或源码仓库。
