---
outline: [2, 3]
---

# OTP provider

`OtpService` coordinates code generation, delivery, storage, cooldown, attempt
limits, and one-time consumption. Enable it with the `otp` feature.

| Component | Role |
| --- | --- |
| `OtpConfig` | Digits, TTL, resend cooldown, and maximum attempts |
| `OtpSender` | Delivery channel contract |
| `OtpStore` | Atomic create and verify/consume contract |
| `OtpService` | Issues `OtpChallenge` and implements `OtpVerifier` |

`OtpService::with_memory` is suitable for a single process and local testing.
For multiple replicas, inject [Redis OTP storage](/adapters/state) or another
shared implementation.

## Usage example

```rust
use std::sync::Arc;

use elura::providers::identity::OtpSender;
use elura::providers::otp::{OtpConfig, OtpService};

let sender: Arc<dyn OtpSender> = application_sender;
let otp = OtpService::with_memory(
    OtpConfig::default(),
    otp_secret.to_vec(), // at least 32 random bytes
    sender,
)?;

let challenge = otp.issue("+8613800138000", "login").await?;
```

Return `challenge.id` to the client, never the generated code. Replace
`with_memory` with `OtpService::new(..., shared_store)` before running multiple
API replicas.

## Production rules

- Use a random secret of at least 32 bytes and rotate it deliberately.
- Bind every challenge to recipient and purpose such as `login` or
  `bind_phone`.
- Enforce API-level recipient, source-IP, device, and global rate limits in
  addition to the store cooldown.
- Never put OTP values in logs, metrics, traces, or analytics.
- Keep errors generic and monitor rejected, expired, and locked challenges.

Delivery is handled through `OtpSender`; the built-in channel is
[Aliyun SMS](./notifications), and applications can implement another sender.
