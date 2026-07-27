# 指南

当你已经理解 Gateway 与 World 的基本模型，并要完成某个具体的开发或
生产任务时，从这里开始。第一次使用 Elura？请先完成[快速开始](/zh/guide/quick-start)。

## 构建应用

| 我想要…… | 阅读…… |
| --- | --- |
| 添加类型化命令、中间件和共享状态 | [World 模块与路由](./world-development) |
| 构建房间、固定步长模拟、AOI、预测、状态同步或延迟补偿 | [实时游戏开发](./realtime-gameplay) |
| 接入 TCP、UDP、WebSocket、WebTransport、QUIC 或自定义传输 | [客户端传输](./transports) |
| 添加 Axum API、回调或内部 HTTP 端点 | [应用 HTTP 服务](./application-http) |
| 连接 Rust、C++ 或 C# 客户端 | [客户端协议 SDK](./client-sdks) |
| 加载并验证应用配置 | [配置](./configuration) |
| 接入身份、OTP、通知或支付 | [Providers](./providers) |

## 交付与运维

| 我想要…… | 阅读…… |
| --- | --- |
| 添加共享状态、服务发现或消息传递 | [分布式基础设施](./distributed) |
| 打包并部署应用 | [部署](./deployment) |
| 配置探针、指标、诊断和优雅停机 | [可观测性与运维](./operations) |
| 在发布前进行生产检查 | [生产检查清单](/zh/reference/production-checklist) |

“指南”说明具体任务和取舍；组件边界与设计原因请查看[概念](/zh/concepts/)。
配置、环境变量、管理 API 和发布细节会从相关指南中直接链接。
