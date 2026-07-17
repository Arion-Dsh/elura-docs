---
outline: 2
---

# Providers

Providers integrate application-level services owned by another system: identity
platforms, notification channels, OTP delivery, and payment networks. They do
not own Elura sessions, routing, or application persistence.

```text
HTTP/API layer -> Provider contract -> external platform
       |                 |
       +-> app database <-+
       +-> Gateway ticket issuer
```

The application remains responsible for accounts, orders, entitlements,
idempotency, rate limits, and secret management. `elura-providers` validates
provider protocols and returns normalized results.

## Catalog

| Area | Built-in integrations | Feature |
| --- | --- | --- |
| [Identity](./identity) | Guest, password, phone, OAuth 2.0, code exchange, WeChat, WeChat Mini, Douyin, QuickSDK | `identity` |
| [OTP](./otp) | `OtpService` with memory or injected storage | `otp` |
| [Notifications](./notifications) | Aliyun SMS | `notification-alisms` |
| [Payments](./payments) | Alipay, Apple, Douyin, QuickSDK, WeChat Mini, WeChat Pay | provider-specific |
| [Custom](./custom) | Application implementations of the object-safe contracts | `providers` |

::: tip Contribute reusable integrations
If a Provider implements a public service or protocol and can serve more than
one application, contribute it to Elura instead of leaving every project to
reimplement it. See [Custom providers](./custom#contribute-upstream) for the PR
expectations. Application-specific account and order logic should remain in the
application.
:::

## Dependency rule

Enable only the integrations the application uses. The crate has no default
features, and concrete implementations stay out of the prelude so external
dependencies remain visible at call sites.

```toml
elura = { version = "0.2.2", features = ["identity", "otp", "notification-alisms"] }
```

Use `full` for documentation or broad development builds, not as the default
production feature set.

## Where providers run

Call providers from an application-owned HTTPS service or trusted worker. After
identity verification, map the normalized identity to an account and issue a
Gateway ticket. After payment verification, commit the order and entitlement
idempotently, then deliver game-side changes through an outbox.

Do not expose provider secrets or raw upstream tokens through the Gateway game
protocol.
