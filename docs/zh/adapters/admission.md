---
outline: 2
---

# 准入控制 Adapter

Admission 在客户端成为活跃 Session 前执行。`AdmissionController` 可以按阶段拒绝
请求并返回重试或策略元数据，而不把 Transport 绑定到具体存储厂商。

## 内置策略

`RealmAdmission` 是 Gateway 本地 Realm Capacity 策略。
`RedisAdmissionController` 通过 `RedisAdmissionConfig` 和 `AdmissionLimit` 提供
共享 IP/User 限制、封禁与维护状态，并实现 `AdmissionAdmin` 供受控管理操作使用。

启用 `redis`，分配明确 Key Prefix，并在应用边界决定 Fail-open/Fail-closed。
除非明确允许降级，否则 Redis 故障不能意外绕过安全策略。

Admission Limit 不能替代边缘限流、连接上限、认证防重放和应用授权。

## 示例：安装 Redis Admission

```rust
use std::sync::Arc;

use elura::adapters::admission::{RedisAdmissionConfig, RedisAdmissionController};
use elura::prelude::*;

let mut config = RedisAdmissionConfig::default();
config.prefix = "game:admission".into();

let admission = Arc::new(RedisAdmissionController::connect(redis_url, config).await?);
let gateway = Gateway::new(gateway_config)
    .admission(admission.clone(), AdmissionSettings::default())
    .admission_admin(admission);
```

注册 `AdmissionAdmin` 只是让同一 Controller 可供受保护的管理 Route 使用，不会
自动公开公共端点。
