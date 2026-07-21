---
outline: [2, 4]
---

# 身份 Provider

所有身份集成都实现 `IdentityProvider`。`IdentityRegistry` 按规范化名称选择实现，
`IdentityService` 则把外部身份连接到应用自有的 `IdentityBindingStore`。

## 公共边界

| 类型 | 职责 |
| --- | --- |
| `IdentityProvider` | 验证 Provider 专有 JSON Credential |
| `IdentityRegistry` | 注册、选择并描述已启用 Provider |
| `IdentityService` | 编排登录、注册与账户绑定 |
| `IdentityBindingStore` | 由应用实现外部身份与账户映射 |
| `VerifiedIdentity` | 规范化 Provider、Subject、Union ID 与属性 |

`IdentityProviderCapabilities` 与 `IdentityRegistrationMode` 描述绑定和注册行为，
`IdentityProviderInfo` 将它暴露给调用方；`IdentityProviderFactory` 支持按配置构建
Registry。

启用 `identity`，并从 `elura::providers::identity` 导入具体实现。

## 内置 Provider

### Guest

`GuestProvider` 签发短期 HMAC `GuestCredential`，`new_rotating` 支持密钥轮换，
密钥至少 32 字节。适合设备游客或试玩身份；长期进度应及时绑定到持久账户。

#### 使用示例

```rust
use std::time::Duration;

use elura::providers::identity::{GuestCredential, GuestProvider, IdentityRegistry};

let registry = IdentityRegistry::new();
let guest = GuestProvider::new([7_u8; 32])?;
let token = guest.issue("device-42", Duration::from_secs(15 * 60))?;
registry.register(guest)?;

let identity = registry
    .authenticate("guest", GuestCredential::new(token))
    .await?;
assert_eq!(identity.subject, "device-42");
```

下一步应通过 `IdentityBindingStore` 解析该身份，不要把 Guest Token 直接发给 Gateway。

### Password

`PasswordProvider<R>` 接收 `PasswordCredential`，并使用应用实现的
`PasswordCredentialStore`。
`hash_password` 使用 Argon2，`normalize_username` 统一用户名。只存密码哈希、限制
登录尝试，并让未知用户与密码错误返回不可区分的外部错误。

#### 使用示例

```rust
use elura::providers::identity::{
    IdentityRegistry, PasswordCredential, PasswordProvider,
};

// password_store 实现 PasswordCredentialStore。
let provider = PasswordProvider::new(password_store)?;
let registry = IdentityRegistry::new();
registry.register(provider)?;

let identity = registry
    .authenticate("password", PasswordCredential::new("alice", submitted_password))
    .await?;
```

新建 Credential 时先用 `hash_password` 生成哈希。除当前请求外，Provider 不应接触明文密码。

### Phone

`PhoneProvider<V>` 接收 `PhoneCredential`，把验证码校验交给 `OtpVerifier`。
登录和绑定手机号使用不同 Purpose，Verifier 必须保留 Purpose 绑定。

#### 使用示例

```rust
use elura::providers::identity::{IdentityRegistry, PhoneCredential, PhoneProvider};

// otp_service 实现 OtpVerifier。
let provider = PhoneProvider::new(otp_service);
let registry = IdentityRegistry::new();
registry.register(provider)?;

let identity = registry
    .authenticate(
        "phone",
        PhoneCredential::new("+8613800138000", challenge_id, submitted_code),
    )
    .await?;
```

`bind_phone` Purpose 应通过 `IdentityService::link` 执行，不要复用登录路径。

### OAuth 2.0 与 Code Exchange

`OAuth2Provider` 使用 `OAuth2Config` 与 `OAuth2Credential` 完成带 PKCE 的授权码
交换；`CodeExchangeProvider` 使用 `CodeExchangeConfig` 与 `CodeCredential` 对接
兼容的 JSON Code Exchange 服务。Redirect URI
必须严格校验，不要把客户端直接提交的 Access Token 当作未经服务端验证的凭证。

#### OAuth 2.0 示例

```rust
use elura::providers::identity::{
    IdentityRegistry, OAuth2Config, OAuth2Credential, OAuth2Provider,
};

let mut config = OAuth2Config::new(
    "example",
    client_id,
    "https://game.example.com/oauth/callback",
    "https://identity.example.com/authorize",
    "https://identity.example.com/token",
    "https://identity.example.com/userinfo",
    "sub",
);
config.scopes = vec!["openid".into(), "profile".into()];
let provider = OAuth2Provider::new(config)?;
let authorization_url = provider.authorization_url(state, pkce_verifier)?;

let registry = IdentityRegistry::new();
registry.register(provider)?;
let identity = registry
    .authenticate(
        "example",
        OAuth2Credential::new(authorization_code, pkce_verifier),
    )
    .await?;
```

应在应用登录 Session 中保存 `state` 与 PKCE Verifier，并在交换回调 Code 前验证它们。

#### Code Exchange 示例

```rust
use elura::providers::identity::{
    CodeCredential, CodeExchangeConfig, CodeExchangeProvider, IdentityRegistry,
};

let config = CodeExchangeConfig::new(
    "company",
    "https://identity.example.com/exchange",
    client_id,
    client_secret,
    "subject",
);
let registry = IdentityRegistry::new();
registry.register(CodeExchangeProvider::new(config)?)?;
let identity = registry
    .authenticate("company", CodeCredential::new(login_code))
    .await?;
```

Exchange Endpoint 必须使用 HTTPS，并返回配置的 Subject 字段。

### WeChat

`WechatIdentity` 使用 `PlatformIdentityConfig` 交换登录 Code，返回 OpenID 以及平台
提供时的 UnionID。Registry 名称是 `wechat`。

#### 使用示例

```rust
use elura::providers::identity::{
    CodeCredential, IdentityRegistry, PlatformIdentityConfig, WechatIdentity,
};

let registry = IdentityRegistry::new();
registry.register(WechatIdentity::new(PlatformIdentityConfig::new(
    app_id,
    app_secret,
))?)?;
let identity = registry
    .authenticate("wechat", CodeCredential::new(login_code))
    .await?;
```

### WeChat Mini Program

`WechatMiniIdentity` 执行小程序 Code Exchange，Registry 名称是 `wechat_mini`。
App Secret 只能保留在服务端，返回的 Session Material 也应按敏感数据处理。

#### 使用示例

```rust
use elura::providers::identity::{
    CodeCredential, IdentityRegistry, PlatformIdentityConfig, WechatMiniIdentity,
};

let registry = IdentityRegistry::new();
registry.register(WechatMiniIdentity::new(PlatformIdentityConfig::new(
    app_id,
    app_secret,
))?)?;
let identity = registry
    .authenticate("wechat_mini", CodeCredential::new(js_code))
    .await?;
```

### Douyin

`DouyinIdentity` 交换平台 Code 并规范化 OpenID/UnionID，Registry 名称是
`douyin`。

#### 使用示例

```rust
use elura::providers::identity::{
    CodeCredential, DouyinIdentity, IdentityRegistry, PlatformIdentityConfig,
};

let registry = IdentityRegistry::new();
registry.register(DouyinIdentity::new(PlatformIdentityConfig::new(
    app_id,
    app_secret,
))?)?;
let identity = registry
    .authenticate("douyin", CodeCredential::new(login_code))
    .await?;
```

### QuickSDK

`QuickSdkIdentity` 使用 `QuickSdkIdentityConfig` 中的产品、渠道与回调密钥验证
`QuickSdkCredential`，Registry 名称是 `quicksdk`。

#### 使用示例

```rust
use elura::providers::identity::{
    IdentityRegistry, QuickSdkCredential, QuickSdkIdentity, QuickSdkIdentityConfig,
};

let registry = IdentityRegistry::new();
registry.register(QuickSdkIdentity::new(QuickSdkIdentityConfig::new(
    "https://identity.example.com/quicksdk",
))?)?;
let identity = registry
    .authenticate(
        "quicksdk",
        QuickSdkCredential {
            token,
            uid,
            product_code: Some(product_code),
            channel_code,
        },
    )
    .await?;
```

## 应用流程

1. 在应用 HTTPS 端点接收 Credential。
2. 通过 `IdentityRegistry` 或 `IdentityService` 验证。
3. 使用 `IdentityBindingStore` 查找或创建应用账户。
4. 应用封禁、Region、Realm 与账户版本策略。
5. 创建或刷新上层应用自有的持久登录会话。
6. 调用 `TicketService::issue_login` 签发短期、一次性的 Elura Gateway 登录票据。

Provider 验证只证明外部身份，不等于授权一个游戏会话。

Gateway 会在认证成功后返回并轮换重连票据，Identity Provider 不应签发重连票据。
重连票据丢失或过期时，上层应用验证自己的 Refresh Session，再签发新的登录票据。

```rust
use std::time::Duration;

use elura::prelude::TicketService;

let tickets = TicketService::new(
    ticket_key,
    "game-login",
    "game-gateway",
    Duration::from_secs(60),
    Duration::from_secs(30 * 60),
)?;
let login_ticket = tickets.issue_login(identity)?;
```
