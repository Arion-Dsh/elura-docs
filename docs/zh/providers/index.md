---
outline: 2
---

# Providers

Provider 用来集成由外部系统提供的应用级服务，包括身份平台、通知渠道、OTP
投递与支付网络。它们不负责 Elura 会话、路由或应用数据持久化。

```text
HTTP/API 层 -> Provider 契约 -> 外部平台
     |              |
     +-> 应用数据库 <-+
     +-> Gateway 票据签发
```

账户、订单、权益、幂等、限流和密钥管理仍由应用负责；`elura-providers` 负责验证
外部协议并返回规范化结果。

## 能力目录

| 分类 | 内置集成 | Feature |
| --- | --- | --- |
| [身份认证](./identity) | 游客、密码、手机号、OAuth 2.0、Code Exchange、微信、微信小程序、抖音、QuickSDK | `identity` |
| [OTP](./otp) | `OtpService`，支持内存或注入存储 | `otp` |
| [通知](./notifications) | 阿里云短信 | `notification-alisms` |
| [支付](./payments) | 支付宝、Apple、抖音、QuickSDK、微信小程序、微信支付 | 各 Provider 独立 |
| [自定义](./custom) | 实现对象安全契约 | `providers` |

::: tip 欢迎贡献通用集成
如果一个 Provider 实现公开服务或协议，并且能服务多个应用，建议贡献到 Elura，
避免每个项目重复实现。PR 要求参见[自定义 Provider](./custom#贡献到上游)。应用专有
账户与订单逻辑仍应留在应用仓库。
:::

## 依赖边界

只启用实际使用的集成。Crate 默认不启用 Feature，具体实现也不会进入 Prelude，
因此调用处能够明确看到外部依赖。

```toml
elura = { version = "0.2.10", features = ["identity", "otp", "notification-alisms"] }
```

`full` 适合文档或大范围开发构建，不应作为生产默认配置。

## Provider 应该运行在哪里

应从应用自有 HTTPS 服务或可信 Worker 调用 Provider。身份验证成功后，将规范化
身份映射到账户并签发 Gateway 票据；支付验证成功后，幂等提交订单和权益，再通过
Outbox 投递游戏侧变更。不要通过 Gateway 游戏协议暴露 Provider 密钥或原始 Token。
