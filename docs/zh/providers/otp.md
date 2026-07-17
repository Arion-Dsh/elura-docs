---
outline: 2
---

# OTP Provider

`OtpService` 统一编排验证码生成、投递、存储、冷却、尝试次数和一次性消费。通过
`otp` Feature 启用。

| 组件 | 职责 |
| --- | --- |
| `OtpConfig` | 位数、TTL、重发冷却和最大尝试次数 |
| `OtpSender` | 投递渠道契约 |
| `OtpStore` | 原子创建和验证/消费契约 |
| `OtpService` | 签发 `OtpChallenge` 并实现 `OtpVerifier` |

`OtpService::with_memory` 适合单进程和本地测试。多个副本应注入
[Redis OTP 存储](/zh/adapters/state)或其他共享实现。

## 生产规则

- 使用至少 32 字节的随机密钥，并制定明确轮换流程。
- 将 Challenge 同时绑定到接收者与 `login`、`bind_phone` 等 Purpose。
- 除 Store Cooldown 外，还要在 API 层按接收者、来源 IP、设备和全局限流。
- 不在日志、指标、Trace 或分析数据中记录 OTP。
- 对外返回通用错误，并监控拒绝、过期和锁定 Challenge。

投递由 `OtpSender` 完成；内置渠道是[阿里云短信](./notifications)，应用也可以
实现其他 Sender。

## 示例：单进程 OTP

```rust
use std::sync::Arc;

use elura::providers::identity::OtpSender;
use elura::providers::otp::{OtpConfig, OtpService};

let sender: Arc<dyn OtpSender> = application_sender;
let otp = OtpService::with_memory(
    OtpConfig::default(),
    otp_secret.to_vec(), // 至少 32 个随机字节
    sender,
)?;

let challenge = otp.issue("+8613800138000", "login").await?;
```

只向客户端返回 `challenge.id`，不能返回生成的验证码。运行多个 API 副本前，应将
`with_memory` 替换为 `OtpService::new(..., shared_store)`。
