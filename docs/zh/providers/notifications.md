---
outline: [2, 3]
---

# 通知 Provider

通知 Provider 实现 OTP 等上层服务所需的投递契约。Elura 当前提供一个具体渠道。

## 阿里云短信

启用 `notification-alisms`，使用 `AliSmsConfig` 构造 `AliSmsSender`。配置包含
Access Key、签名名、Purpose 到模板的映射、Region、Endpoint 与请求超时。

`AliSmsSender` 实现 `OtpSender`，负责签名请求、限制响应体、将限流映射为可重试
错误，并拒绝未成功的 Provider 响应。

凭证应放入 Secret Manager；必要时为不同 Purpose 使用不同模板，并在应用层设置
发送额度。Provider API 返回成功仅代表请求已受理，不代表手机已经收到短信。

### 使用示例

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

OTP Purpose 会选择对应模板。运行多个 API 副本前，应使用共享 `OtpStore`
代替 `with_memory`。

## 其他渠道

邮件、Push、语音和其他短信厂商目前没有内置实现。OTP 场景可实现 `OtpSender`；
非 OTP 通知应定义应用自己的契约。参见[自定义 Provider](./custom)。
