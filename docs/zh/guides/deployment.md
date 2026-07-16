# 部署

Elura 提供部署脚手架，而不是通用生产平台。应把生成的 Docker 和 Kubernetes
文件视为应用自有的起点。

## 容器镜像

生成的多阶段 Dockerfile 使用 Rust 1.97 构建所有二进制文件，并将 `gateway`
和 `world` 复制到精简 Debian 运行时镜像。运行容器使用非 Root 用户。

在生成应用根目录构建：

```bash
docker build -t elura-game:dev .
```

生产环境应按 Digest 锁定基础镜像，加入供应链扫描，并发布不可变应用 Tag。

## Docker Compose

```bash
cp .env.example .env
# Replace every placeholder in .env.
docker compose -f deploy/docker-compose.yml up
```

Compose 以只读方式挂载非密钥 JSON 配置，发布 Gateway 客户端与管理端口以及
World 管理端口；World 命令监听端口只保留在 Compose 网络内。

## Kubernetes

生成的 Kustomize Base 包含：

- Namespace；
- Gateway 与 World Deployment 和 Service；
- 用于 DNS 发现的 Headless World Service；
- 保存非密钥运行时 JSON 的 ConfigMap；
- Readiness、Startup 与 Liveness Probe；
- 资源 Request 与 Limit；
- 受限的容器 Security Context；
- NetworkPolicy 和 Gateway PodDisruptionBudget。

创建私有 Overlay，不要把密钥写入 Base：

```bash
cp deploy/kubernetes/secret.example.yaml /path/to/private-overlay/secret.yaml
# Replace every placeholder, reference the base and secret, then:
kubectl apply -k /path/to/private-overlay
```

在 Overlay 中设置应用镜像。不要把示例文件作为真实 `Secret` 提交；Base64 编码
并不是加密。

## 扩容

### Gateway

增加副本前：

- 注入共享票据 Replay Store；
- 明确在线租约和重复登录策略；
- 按需配置跨 Gateway Push 与会话控制；
- 确保 Ingress 正确处理 WebSocket/TCP 长连接；
- 确认优雅终止时间大于应用排空窗口。

### World

增加副本前：

- 确保服务发现返回所有 Ready 实例，并及时移除正在终止的实例；
- 明确 Handler 是无状态的，还是需要所有权/分片；
- 验证跨目标的幂等与持久化行为；
- 验证连接池和每连接并发容量；
- 为实际副本数设置合适的 PodDisruptionBudget。

## 网络与安全

- 只公开 Gateway 客户端监听端口。
- World 与管理端口只放在私有网络。
- 非回环管理监听必须使用 Bearer Token。
- 根据威胁模型使用内部令牌、网络策略和 TLS/mTLS 保护 Gateway 到 World 流量。
- 在可信 Ingress 终止公网 TLS，或配置 Gateway 服务端 TLS。
- 启用 Proxy Protocol 时只信任负载均衡器 CIDR。

## 滚动发布

ELR2 包含显式协议版本，但应用 protobuf 变化仍需兼容性规划。优先添加字段并保持
路由 ID 稳定。当 Gateway 将开始发送新的命令结构时，先部署 World，再部署
Gateway。除非旧服务端已接受新行为，否则最后再发布客户端。
