---
outline: [2, 4]
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

#### 使用示例

```rust
use elura::providers::payment::{
    AlipayCheckoutOptions, AlipayClientMode, AlipayConfig, AlipayPayment,
    CheckoutRequest, Money, PaymentRegistry,
};

let mut config = AlipayConfig::production(app_id, private_key_pem, alipay_public_key_pem);
config.notify_url = Some("https://game.example.com/payments/alipay".into());

let registry = PaymentRegistry::new();
registry.register(AlipayPayment::new(config)?)?;
let request = CheckoutRequest::new(
    "order-2026-0001",
    Money::new("CNY", 1_900)?,
    "Starter pack",
).with_provider_options(AlipayCheckoutOptions {
    client_mode: AlipayClientMode::App,
})?;
let checkout = registry.checkout("alipay", request).await?;
```

创建 Provider Checkout 前，必须先持久化内部订单。

### Apple

`ApplePayment` 使用 `AppleConfig` 和 `AppleEnvironment` 验证 App Store Purchase
及服务端通知。交易 ID 只是外部证据，权益仍必须经过应用订单流水发放。

#### 使用示例

```rust
use elura::providers::payment::{
    AppleConfig, AppleEnvironment, ApplePayment, PaymentRegistry,
};

let config = AppleConfig::new(
    issuer_id,
    "com.example.game",
    key_id,
    private_key_pem,
    AppleEnvironment::Production,
)
.with_app_apple_id(app_apple_id)
.with_trusted_roots(apple_root_certificates_der);

let registry = PaymentRegistry::new();
registry.register(ApplePayment::new(config)?)?;
```

只加载 Apple 为 StoreKit 验证说明的 Root Certificate，不要使用通用 WebPKI Root Set。

### 抖音

`DouyinPayment` 通过 `DouyinConfig` 支持商户订单查询和回调验证，并在内部管理
上游 Access Token 交换。

#### 使用示例

```rust
use elura::providers::payment::{DouyinConfig, DouyinPayment, PaymentRegistry};

let config = DouyinConfig::new(callback_token, app_id, app_secret);
let registry = PaymentRegistry::new();
registry.register(DouyinPayment::new(config)?)?;
```

Callback Token 应与 App Secret 分离；重建回调请求时不要规范化已签名字段。

### QuickSDK

`QuickSdkPayment` 验证并解密 QuickSDK 回调。它仅提供 Notification 能力，
Checkout 仍由渠道或客户端流程负责。

#### 使用示例

```rust
use elura::providers::payment::{PaymentRegistry, QuickSdkPayment};

let provider = QuickSdkPayment::new(md5_key, callback_key.to_vec(), false)?;
let registry = PaymentRegistry::new();
registry.register(provider)?;
```

最后一个参数用于选择 QuickSDK 测试环境。生产环境应保持 `false`，不要只根据
回调 Payload 决定环境。

### 微信小程序

`WechatMiniPayment` 使用 `WechatMiniConfig` 配置小程序 Checkout 与回调验证；
使用 `WechatMiniCheckoutOptions` 传递 OpenID 等 Provider 专有字段。

#### 使用示例

```rust
use elura::providers::payment::{
    PaymentRegistry, WechatMiniConfig, WechatMiniPayment,
};

let mut config = WechatMiniConfig::new(app_id, app_key, offer_id);
config.callback_token = Some(callback_token);
config.encoding_aes_key = Some(encoding_aes_key);

let registry = PaymentRegistry::new();
registry.register(WechatMiniPayment::new(config)?)?;
```

每个 `CheckoutRequest` 都应使用 `WechatMiniCheckoutOptions`。Session Key 属于单次请求，
不能放入全局 Provider 配置。

### 微信支付

`WechatPayPayment` 支持 Checkout、Query 和 API v3 通知验证。
`WechatPayConfig` 管理商户身份、签名密钥、微信验签公钥与回调校验配置。

#### 使用示例

```rust
use elura::providers::payment::{
    PaymentRegistry, WechatPayConfig, WechatPayPayment,
};

let config = WechatPayConfig::new(
    merchant_id,
    app_id,
    "https://game.example.com/payments/wechat",
)
.with_merchant_identity(serial_number, api_v3_key, merchant_private_key_pem)
.with_wechat_identity(wechat_public_key_id, wechat_public_key_pem);

let registry = PaymentRegistry::new();
registry.register(WechatPayPayment::new(config)?)?;
```

API v3 Key 必须恰好包含 32 字节。商户密钥和微信验签密钥应通过配置轮换，
不能从回调输入中获取。

## 安全支付流程

1. 使用唯一商户订单号创建内部订单。
2. 通过 `PaymentRegistry` 调用选定 Provider。
3. 只返回客户端需要的 Checkout 参数。
4. 使用原始 HTTPS Method、URI、Header 和 Bytes 重建 `NotificationRequest`。
5. 验证签名、Provider、金额、币种和 Replay State。
6. 幂等提交订单状态与权益。
7. 通过 [Outbox](/zh/adapters/outbox)投递游戏侧变更。

不要仅凭客户端回调发放权益。Provider 回调可能重复、延迟或乱序。
