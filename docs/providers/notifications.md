---
outline: 2
---

# Notification providers

Notification providers implement delivery contracts used by higher-level
services such as OTP. Elura currently ships one concrete notification channel.

## Aliyun SMS

Enable `notification-alisms` and construct `AliSmsSender` with `AliSmsConfig`.
The configuration contains the access key, signing name, purpose-to-template
mapping, region, endpoint, and request timeout used for the Aliyun RPC request.

`AliSmsSender` implements `OtpSender`, signs requests, bounds response bodies,
maps throttling to a retryable provider error, and rejects unsuccessful provider
responses.

Keep credentials in a secret manager, use separate templates per purpose when
required, and apply application-level send quotas. A successful provider API
response means the request was accepted; it does not prove handset delivery.

## Other channels

Email, push, voice, and other SMS vendors are not built in. Implement
`OtpSender` for OTP delivery or define an application contract when the message
is not an OTP. See [Custom providers](./custom).

## Example: Aliyun SMS sender

```rust
use std::collections::HashMap;

use elura::providers::notification::{AliSmsConfig, AliSmsSender};

let config = AliSmsConfig::new(
    access_key_id,
    access_key_secret,
    "MyGame",
    HashMap::from([
        ("login".into(), "SMS_LOGIN_TEMPLATE".into()),
        ("bind_phone".into(), "SMS_BIND_TEMPLATE".into()),
    ]),
);
let sender = AliSmsSender::new(config)?;
```

Pass `Arc::new(sender)` to `OtpService`; the OTP purpose selects the matching
template.
