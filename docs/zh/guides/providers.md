# 身份、OTP、通知与支付

`elura-providers` 包含可选 Provider 实现和 Provider 无关契约。只启用应用真正
需要的集成；此 Crate 默认不启用任何功能。

## 身份

可用的身份能力包括：

- 游客身份；
- 使用 Argon2 密码哈希的用户名/密码；
- 基于 `OtpVerifier` 的手机号身份；
- 通用 OAuth 2.0 与授权码交换；
- 微信、微信小程序、抖音与 QuickSDK 平台 Provider；
- 由应用自有 ID 选择 Provider 的 Registry。

公开登录/账户服务应调用这些 Provider，将外部身份映射到内部账户，再签发
Elura Gateway 票据。不要把 Provider 密钥或平台 Token 放入 Gateway 公共协议
载荷。

用户名应使用 Provider Helper 规范化。只存储密码哈希，对登录尝试限流，并避免
暴露账户是否存在。

## OTP 与通知

`OtpService` 与 `OtpStore` 配合工作，提供内存和 Redis 实现。通知服务支持
阿里云短信。

生产 OTP 流程应强制执行：

- 较短有效期与一次性消费；
- 按接收者、IP 和全局限流；
- 尝试次数限制以及锁定/退避；
- 绑定用途（登录、注册、找回、支付）；
- 不在日志、指标、Trace 或分析数据中记录 OTP。

## 支付

实现包括支付宝、Apple、抖音、QuickSDK、微信小程序和微信支付。共享模型覆盖
Checkout、通知、查询、退款、购买、能力描述和 Provider 注册。

推荐支付流程：

1. 使用唯一商户订单号创建内部订单。
2. 调用所选 Provider 创建 Checkout/购买请求。
3. 只向游戏客户端返回客户端所需参数。
4. 通过独立 HTTPS 端点接收 Provider 通知。
5. 验证签名、时间戳/证书、Provider 身份、金额、币种和商户订单号。
6. 在数据库事务中幂等应用事件。
7. 使用 Outbox 将权益变更投递给游戏服务。
8. 通知状态不明确时主动查询 Provider。

不要仅凭客户端回调发放权益。Provider 通知可能重复、延迟或乱序。

## 功能开关示例

```toml
# Identity and OTP only
elura = { version = "0.1.1", features = ["identity", "otp"] }

# WeChat Pay
elura = { version = "0.1.1", features = ["payment-wechat-pay"] }
```

`full` 适合开发或文档构建，不应成为生产应用默认值。更小的 Feature Set 可以
减少编译时间、依赖面和意外配置 Provider 的风险。
