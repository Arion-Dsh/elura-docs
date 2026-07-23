---
layout: home

hero:
  text: 驱动游戏背后的在线世界
  tagline: 一套 Rust 游戏服务器框架：从网络协议到业务 Handler 全程类型安全，只在需要时扩展基础设施。
  actions:
    - theme: brand
      text: 构建第一个服务
      link: /zh/guide/quick-start
    - theme: alt
      text: 探索整体架构
      link: /zh/concepts/architecture

features:
  - icon: "01"
    title: 从空目录到在线服务
    details: 一条命令生成可编辑的 Rust 应用、本地配置、容器文件和部署清单。
    link: /zh/guide/quick-start
    linkText: 开始构建
  - icon: "02"
    title: 从协议到 Handler 全程类型安全
    details: 串联 ELR2 帧、生成的客户端 SDK、protobuf 消息、类型化 Handler 和显式中间件。
    link: /zh/guides/world-development
    linkText: 编写游戏逻辑
  - icon: "03"
    title: 扩容无需重写业务
    details: 保持应用边界不变，按需加入 Redis、SQL、DNS、Kubernetes、指标、保护和水平路由。
    link: /zh/guides/deployment
    linkText: 面向生产设计
  - icon: "04"
    title: 权威实时游戏
    details: 组合固定 Tick、房间、AOI、状态同步、预测、插值、延迟补偿和可复现弱网测试。
    link: /zh/guides/realtime-gameplay
    linkText: 构建实时系统
---

## 从生成一个应用开始

你不需要先理解 Elura 的每个 Crate。先生成并运行应用，再一边修改真实代码，
一边理解各个组件：

```bash
cargo install elura-cli
mkdir my-game && cd my-game
elura init all --dir .
```

生成器会创建可编辑的应用代码、本地配置、Docker 文件和 Kubernetes Manifest。
继续阅读 [10 分钟快速开始](/zh/guide/quick-start)，配置开发密钥并启动两个进程。

## 先记住这一张图

```text
玩家客户端 ──> Gateway ──> World ──> 你的类型化 Handler
               会话与认证    路由       游戏规则
```

- **Gateway** 负责公网连接、认证、会话和路由。
- **World** 执行已认证的游戏命令和中间件。
- **你的应用** 负责业务路由、游戏规则、配置、持久化和部署选择。

无论是在本地、单体进程还是多个 Kubernetes 节点中运行，这个边界都不会改变。
需要完整背景时，再阅读[架构概览](/zh/concepts/architecture)。

## 选择下一步

| 我想要…… | 从这里开始 |
| --- | --- |
| 第一次运行 Elura | [快速开始](/zh/guide/quick-start) |
| 不使用 CLI 在一个进程运行 Gateway 与 World | [手动单体搭建](/zh/guide/manual-monolith) |
| 不使用 CLI 拆分 Gateway 与 World | [手动拆分搭建](/zh/guide/manual-setup) |
| 组装共享状态与动态发现 | [手动分布式搭建](/zh/guide/manual-distributed) |
| 添加第一个游戏命令 | [World 模块与路由](/zh/guides/world-development) |
| 构建实时房间、AOI、预测或实体状态同步 | [实时游戏开发](/zh/guides/realtime-gameplay) |
| 添加 TCP、UDP、WebSocket、WebTransport、QUIC 或自定义客户端端点 | [客户端传输](/zh/guides/transports) |
| 添加 Axum HTTP API 或回调端点 | [应用 HTTP 服务](/zh/guides/application-http) |
| 连接 Rust、C++、C# 或 TypeScript 客户端 | [客户端协议 SDK](/zh/guides/client-sdks) |
| 看懂生成的文件 | [生成的项目](/zh/guide/generated-project) |
| 选择 Redis、SQL、DNS、Kubernetes 或自定义后端 | [Adapters](/zh/adapters/) |
| 接入登录、OTP、短信或支付 | [Providers](/zh/providers/) |
| 准备生产发布 | [生产检查清单](/zh/reference/production-checklist) |

::: info 项目状态
当前版本为 **v0.2.8**。本版本新增一次登录同时签发 HTTP Access/Refresh Token
并交换一次性 Gateway Ticket 的流程，提供内置 `IdentityService` 桥接，并在
C++、C# 与 TypeScript 之外加入独立 Rust 客户端 SDK 生成。公开框架路由统一使用
`/elura/...`，Kubernetes 兼容的存活与就绪探针保留为 `/healthz` 和 `/readyz`。
项目尚未进入 1.0：生产环境应锁定精确版本，并在升级前检查 Release Notes 与
兼容性。
:::
