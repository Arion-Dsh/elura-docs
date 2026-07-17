---
outline: [2, 3]
---

# 支付 Provider

支付集成共享 `PaymentProvider`、`PaymentRegistry`、规范化金额/订单模型、能力发现
与回调验证。只启用实际部署的 Provider Feature。

## 能力矩阵

| Provider | Registry 名称 | Checkout | Query | Notification | Purchase | Feature |
| --- | --- | --- | --- | --- | --- | --- |
| 支付宝 | `alipay` | 是 | 是 | 是 | 否 | `payment-alipay` |
| Apple | `apple` | 否 | 否 | 是 | 是 | `payment-apple` |
| 抖音 | `douyin` | 否 | 是 | 是 | 否 | `payment-douyin` |
| QuickSDK | `quicksdk` | 否 | 否 | 是 | 否 | `payment-quicksdk` |
| 微信小程序 | `wechatmini` | 是 | 否 | 是 | 否 | `payment-wechat-mini` |
| 微信支付 | `wechatpay` | 是 | 是 | 是 | 否 | `payment-wechat-pay` |

当前内置实现都没有声明公共 Refund 能力。调用方应读取
`PaymentProviderInfo.capabilities`，不要假定所有操作都存在。

## 公共契约

`PaymentRegistry` 在调用前后验证请求与结果。`CheckoutRequest`、
`PaymentLookup`、`NotificationRequest`、`RefundRequest` 和 `PurchaseRequest`
描述操作；`PaymentNotificationVerifier` 将回调验证与持久防重放组合起来。

`Money` 使用币种与最小货币单位；Checkout 返回 `CheckoutResult` 及 Provider 专有
`ClientPayload`；Query 返回带 `PaymentStatus` 的 `Payment`；验证后的回调返回
`PaymentEvent`；购买验证返回 `Purchase`。`PaymentCapabilities` 与
`PaymentProviderInfo` 暴露能力，`PaymentProviderFactory` 支持按配置构建 Registry。

### 支付宝

`AlipayPayment` 支持 Checkout、订单查询和签名通知；`AlipayConfig`、
`AlipayClientMode` 与 `AlipayCheckoutOptions` 选择客户端流程与专有字段。

### Apple

`ApplePayment` 使用 `AppleConfig` 和 `AppleEnvironment` 验证 App Store Purchase
及服务端通知。交易 ID 只是外部证据，权益仍必须经过应用订单流水发放。

### 抖音

`DouyinPayment` 通过 `DouyinConfig` 支持商户订单查询和回调验证，并在内部管理
上游 Access Token 交换。

### QuickSDK

`QuickSdkPayment` 验证并解密 QuickSDK 回调。它仅提供 Notification 能力，
Checkout 仍由渠道或客户端流程负责。

### 微信小程序

`WechatMiniPayment` 使用 `WechatMiniConfig` 配置小程序 Checkout 与回调验证；
使用 `WechatMiniCheckoutOptions` 传递 OpenID 等 Provider 专有字段。

### 微信支付

`WechatPayPayment` 支持 Checkout、Query 和 API v3 通知验证。
`WechatPayConfig` 管理商户身份、签名密钥、微信验签公钥与回调校验配置。

## 安全支付流程

1. 使用唯一商户订单号创建内部订单。
2. 通过 `PaymentRegistry` 调用选定 Provider。
3. 只返回客户端需要的 Checkout 参数。
4. 使用原始 HTTPS Method、URI、Header 和 Bytes 重建 `NotificationRequest`。
5. 验证签名、Provider、金额、币种和 Replay State。
6. 幂等提交订单状态与权益。
7. 通过 [Outbox](/zh/adapters/outbox)投递游戏侧变更。

不要仅凭客户端回调发放权益。Provider 回调可能重复、延迟或乱序。

## 示例：创建支付宝 Checkout

```rust
use elura::providers::payment::{
    AlipayCheckoutOptions, AlipayClientMode, CheckoutRequest, Money, PaymentRegistry,
};

let registry: PaymentRegistry = configured_registry;
let request = CheckoutRequest::new(
    "order-2026-0001",
    Money::new("CNY", 1_900)?,
    "Starter pack",
).with_provider_options(AlipayCheckoutOptions {
    client_mode: AlipayClientMode::App,
})?;

let checkout = registry.checkout("alipay", request).await?;
```

`configured_registry` 必须已经注册使用服务端密钥材料创建的 `AlipayPayment`。
调用 Checkout 前应先持久化内部订单。
