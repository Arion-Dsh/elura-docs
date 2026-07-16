# Identity, OTP, notifications, and payments

`elura-providers` contains optional provider implementations and provider-neutral
contracts. Enable only the integrations an application uses; the crate has no
default features.

## Identity

Available identity building blocks include:

- guest identity;
- username/password with Argon2 password hashing;
- phone identity backed by an `OtpVerifier`;
- generic OAuth 2.0 and authorization-code exchange;
- WeChat, WeChat Mini Program, Douyin, and QuickSDK platform providers;
- a registry for selecting providers by application-owned identifiers.

The public login/account service should call these providers, map external
identities to internal accounts, and issue a Elura Gateway ticket. Do not put
provider secrets or platform tokens in the Gateway’s public protocol payloads.

Password usernames are normalized by the provider helper. Store only password
hashes, rate-limit login attempts, and avoid revealing whether an account
exists.

## OTP and notifications

`OtpService` works with an `OtpStore`; memory and Redis implementations are
available. Aliyun SMS is available as a notification sender.

Production OTP flows should enforce:

- short expiry and one-time consumption;
- per-recipient, per-IP, and global issuance limits;
- attempt limits and lockout/backoff;
- purpose binding (login, registration, recovery, payment);
- no OTP values in logs, metrics, traces, or analytics.

## Payments

Provider implementations include Alipay, Apple, Douyin, QuickSDK, WeChat Mini
Program, and WeChat Pay. The shared model covers checkout, notification,
querying, refunds, purchases, capabilities, and provider registration.

Recommended payment flow:

1. Create an internal order with a unique merchant order ID.
2. Ask the chosen provider to create a checkout/purchase request.
3. Return only the client-facing parameters to the game client.
4. Receive provider notifications on a dedicated HTTPS endpoint.
5. Verify signature, timestamp/certificate, provider identity, amount, currency,
and merchant order ID.
6. Apply the resulting event idempotently in a database transaction.
7. Use an outbox to deliver entitlement changes to game services.
8. Query the provider when notification state is ambiguous.

Never grant an entitlement based solely on a client callback. Provider
notifications can be duplicated, delayed, or reordered.

## Feature examples

```toml
# Identity and OTP only
elura = { version = "0.1.1", features = ["identity", "otp"] }

# WeChat Pay
elura = { version = "0.1.1", features = ["payment-wechat-pay"] }
```

Use `full` for development or documentation builds, not by default in a
production application. Smaller feature sets reduce compile time, dependency
surface, and accidental provider configuration.
