---
outline: [2, 3]
---

# 准入控制 Adapter

Admission 在客户端成为活跃 Session 前执行。`AdmissionController` 可以按阶段拒绝
请求并返回重试或策略元数据，而不把 Transport 绑定到具体存储厂商。

## 内置策略

`RealmAdmission` 是 Gateway 本地的 Region/Realm Allowlist，用于拒绝被路由到当前
Gateway 不负责 Realm 的已认证身份；它不统计 Session。最终的已认证 Session 容量
应通过 `GatewayOnlineConfig::with_realm_capacity` 和共享 `OnlineDirectory` 配置。
`RedisAdmissionController` 通过 `RedisAdmissionConfig` 和 `AdmissionLimit` 提供
共享 IP/User 限制、封禁与维护状态，并实现 `AdmissionAdmin` 供受控管理操作使用。

启用 `redis`，分配明确 Key Prefix，并在应用边界决定 Fail-open/Fail-closed。
除非明确允许降级，否则 Redis 故障不能意外绕过安全策略。

Admission Limit 不能替代边缘限流、连接上限、认证防重放和应用授权。

登录队列顺序、优先级、位置和预计时间仍由上层应用决定。原子硬容量边界参见
[在线状态](./online#登录排队与-realm-容量)。

### 安装 Redis Admission

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

### 修改共享策略

```rust
use std::{net::IpAddr, time::Duration};

let address: IpAddr = "203.0.113.10".parse()?;
admission
    .ban_ip(address, Duration::from_secs(3600), "abusive traffic")
    .await?;

admission
    .set_maintenance(Duration::from_secs(600), "scheduled rollout")
    .await?;

// 稍后恢复：
admission.unban_ip(address).await?;
admission.clear_maintenance().await?;
```

只允许已认证的运维流程调用这些方法。Limit、Ban 与 Maintenance State 共享
Controller 配置的 Prefix。
