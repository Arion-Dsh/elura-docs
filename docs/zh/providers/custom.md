---
outline: 2
---

# 自定义 Provider

自定义集成只需实现所属领域的对象安全契约，并以稳定的规范化名称注册。

| 领域 | 扩展契约 | Registry/编排器 |
| --- | --- | --- |
| 身份 | `IdentityProvider` | `IdentityRegistry`、`IdentityService` |
| OTP 投递 | `OtpSender` | `OtpService` |
| OTP 验证 | `OtpVerifier` | `PhoneProvider` |
| 支付 | `PaymentProvider` | `PaymentRegistry` |

账户和订单持久化应留在 Provider 之外。Provider 负责验证上游协议、限制不可信
响应、规范化身份或事件，并返回具有正确重试语义的 `ProviderError`；它不应签发
Gateway 票据或直接修改游戏状态。

## 检查清单

- 使用小写稳定名称，并拒绝重复注册。
- 定义可序列化 Credential/Request Schema，并拒绝未知字段。
- 精确声明 Capability，未实现操作必须保持 Unsupported。
- 为上游请求设置超时和响应大小上限。
- 需要时使用常量时间验证签名。
- 不在 Debug 输出或用户错误中暴露密钥。
- 测试畸形输入、上游失败、Replay 与密钥轮换。

具体实现按设计不会进入 Prelude，应从 `elura::providers` 显式导入，让外部依赖
在组合代码中保持可见。

## 贡献到上游

包含组织专有策略或只服务一个应用的 Provider 应保留在业务仓库。实现可复用公开
集成时，优先向 Elura 提交 PR。

Provider PR 应包括：

- 默认不启用的独立 Cargo Feature；
- 完整配置校验、请求超时与不可信响应大小限制；
- 准确 Capability Metadata 与稳定规范化名称；
- 与协议相关的签名、Replay、密钥轮换、畸形输入和上游失败测试；
- 不包含生产凭证或客户私有数据的脱敏 Fixture；
- Public API 覆盖、Rustdoc 以及同步的中英文目录说明。

共享 Crate 不能包含应用账户、订单或权益策略。PR 中应说明新增依赖、维护成本与
上游协议依据。

## 示例：Identity Provider 骨架

```rust
use std::collections::HashMap;

use async_trait::async_trait;
use elura::providers::identity::{IdentityProvider, ProviderName, VerifiedIdentity};
use elura::providers::ProviderResult;
use serde_json::Value;

struct CompanyIdentity;

#[async_trait]
impl IdentityProvider for CompanyIdentity {
    fn name(&self) -> &str { "company" }

    async fn authenticate(&self, credential: Value) -> ProviderResult<VerifiedIdentity> {
        let subject = credential["subject"]
            .as_str()
            .ok_or(elura::providers::ProviderError::InvalidCredentials)?;
        Ok(VerifiedIdentity {
            provider: ProviderName::parse(self.name())?,
            subject: subject.to_owned(),
            union_id: None,
            attributes: HashMap::new(),
        })
    }
}
```

真实实现必须验证外部证据；直接接受 Subject 字段只用于展示代码结构。
