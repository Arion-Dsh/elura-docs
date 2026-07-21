---
outline: [2, 4]
---

# Payment providers

Payment integrations share `PaymentProvider`, `PaymentRegistry`, normalized
money/order models, capability discovery, and callback verification. Enable only
the provider-specific features you deploy.

## Capability matrix

| Provider | Registry name | Checkout | Query | Notification | Purchase | Feature |
| --- | --- | --- | --- | --- | --- | --- |
| Alipay | `alipay` | yes | yes | yes | no | `payment-alipay` |
| Apple | `apple` | no | no | yes | yes | `payment-apple` |
| Douyin | `douyin` | no | yes | yes | no | `payment-douyin` |
| QuickSDK | `quicksdk` | no | no | yes | no | `payment-quicksdk` |
| WeChat Mini | `wechatmini` | yes | no | yes | no | `payment-wechat-mini` |
| WeChat Pay | `wechatpay` | yes | yes | yes | no | `payment-wechat-pay` |

The current built-ins do not advertise the shared refund capability. Check
`PaymentProviderInfo.capabilities` instead of assuming every operation exists.

## Shared contracts

`PaymentRegistry` validates requests and results around provider calls.
`CheckoutRequest`, `PaymentLookup`, `NotificationRequest`, `RefundRequest`, and
`PurchaseRequest` model operations; `PaymentNotificationVerifier` combines
callback verification with durable replay protection.

`Money` carries currency and minor units. Checkout returns `CheckoutResult` and
its provider-specific `ClientPayload`; queries return `Payment` with
`PaymentStatus`; verified callbacks return `PaymentEvent`; purchase verification
returns `Purchase`. `PaymentCapabilities` and `PaymentProviderInfo` make feature
support discoverable, while `PaymentProviderFactory` supports configuration-led
registry construction.

### Alipay

`AlipayPayment` supports checkout, merchant/provider-order query, and signed
notifications. `AlipayConfig`, `AlipayClientMode`, and
`AlipayCheckoutOptions` select the client flow and provider-specific fields.

#### Usage example

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

Persist the internal order before creating the provider checkout.

### Apple

`ApplePayment` verifies App Store purchases and server notifications using
`AppleConfig` and `AppleEnvironment`. Treat transaction identifiers as external
evidence and grant entitlements only through the application order pipeline.

#### Usage example

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

Load only the Apple roots documented for StoreKit verification; do not use a
general WebPKI root set.

### Douyin

`DouyinPayment` supports merchant-order query and callback verification through
`DouyinConfig`. It manages the upstream access-token exchange internally.

#### Usage example

```rust
use elura::providers::payment::{DouyinConfig, DouyinPayment, PaymentRegistry};

let config = DouyinConfig::new(callback_token, app_id, app_secret);
let registry = PaymentRegistry::new();
registry.register(DouyinPayment::new(config)?)?;
```

Keep the callback token distinct from the app secret and reconstruct callbacks
from the original request without normalizing signed fields.

### QuickSDK

`QuickSdkPayment` verifies and decrypts QuickSDK callbacks. It is a
notification-only integration, so checkout remains owned by the channel/client
flow.

#### Usage example

```rust
use elura::providers::payment::{PaymentRegistry, QuickSdkPayment};

let provider = QuickSdkPayment::new(md5_key, callback_key.to_vec(), false)?;
let registry = PaymentRegistry::new();
registry.register(provider)?;
```

The final flag selects the QuickSDK test environment. Keep it `false` in
production and never accept the environment from the callback payload alone.

### WeChat Mini Program

`WechatMiniPayment` uses `WechatMiniConfig` for mini-program checkout and
callback verification. Use `WechatMiniCheckoutOptions` for the provider-specific
open ID and client parameters.

#### Usage example

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

Use `WechatMiniCheckoutOptions` on each `CheckoutRequest`; the session key is
request-specific and must not be stored in global Provider configuration.

### WeChat Pay

`WechatPayPayment` supports checkout, query, and API v3 notification
verification. `WechatPayConfig` owns merchant identity, signing keys, the
WeChat verification public key, and callback validation settings.

#### Usage example

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

The API v3 key must contain exactly 32 bytes. Rotate merchant and WeChat
verification keys through configuration, not callback input.

## Safe payment playbook

1. Create an internal order with a unique merchant order ID.
2. Call the selected provider through `PaymentRegistry`.
3. Return only client-facing checkout parameters.
4. Reconstruct `NotificationRequest` from the original HTTPS method, URI,
   headers, and bytes.
5. Verify signature, provider identity, amount, currency, and replay state.
6. Commit the order transition and entitlement idempotently.
7. Publish the game-side change through an [Outbox](/adapters/outbox).

Never grant an entitlement from a client callback alone. Provider callbacks can
be duplicated, delayed, or reordered.
