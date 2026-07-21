---
outline: [2, 3]
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

### Usage example

```rust
use std::{collections::HashMap, sync::Arc};

use elura::providers::notification::{AliSmsConfig, AliSmsSender};
use elura::providers::otp::{OtpConfig, OtpService};

let config = AliSmsConfig::new(
    access_key_id,
    access_key_secret,
    "MyGame",
    HashMap::from([
        ("login".into(), "SMS_LOGIN_TEMPLATE".into()),
        ("bind_phone".into(), "SMS_BIND_TEMPLATE".into()),
    ]),
);
let sender = Arc::new(AliSmsSender::new(config)?);
let otp = OtpService::with_memory(
    OtpConfig::default(),
    otp_secret.to_vec(),
    sender,
)?;
```

The OTP purpose selects the matching template. Use a shared `OtpStore` instead
of `with_memory` before running multiple API replicas.

## Other channels

Email, push, voice, and other SMS vendors are not built in. Implement
`OtpSender` for OTP delivery or define an application contract when the message
is not an OTP. See [Custom providers](./custom).
