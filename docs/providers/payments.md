---
outline: [2, 3]
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

### Apple

`ApplePayment` verifies App Store purchases and server notifications using
`AppleConfig` and `AppleEnvironment`. Treat transaction identifiers as external
evidence and grant entitlements only through the application order pipeline.

### Douyin

`DouyinPayment` supports merchant-order query and callback verification through
`DouyinConfig`. It manages the upstream access-token exchange internally.

### QuickSDK

`QuickSdkPayment` verifies and decrypts QuickSDK callbacks. It is a
notification-only integration, so checkout remains owned by the channel/client
flow.

### WeChat Mini Program

`WechatMiniPayment` uses `WechatMiniConfig` for mini-program checkout and
callback verification. Use `WechatMiniCheckoutOptions` for the provider-specific
open ID and client parameters.

### WeChat Pay

`WechatPayPayment` supports checkout, query, and API v3 notification
verification. `WechatPayConfig` owns merchant identity, signing keys, the
WeChat verification public key, and callback validation settings.

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

## Example: create an Alipay checkout

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

`configured_registry` must already contain an `AlipayPayment` created from
server-side key material. Persist the internal order before this call.
