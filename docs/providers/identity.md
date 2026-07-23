---
outline: [2, 4]
---

# Identity providers

All identity integrations implement `IdentityProvider`. `IdentityRegistry`
selects them by normalized name, while `IdentityService` connects verified
external identities to the application-owned `IdentityBindingStore`.

## Shared boundary

| Type | Responsibility |
| --- | --- |
| `IdentityProvider` | Authenticate provider-specific JSON credentials |
| `IdentityRegistry` | Register, select, and describe enabled providers |
| `IdentityService` | Login, registration, and account linking orchestration |
| `IdentityBindingStore` | Application-owned external identity/account mapping |
| `VerifiedIdentity` | Normalized provider, subject, optional union ID, and attributes |

`IdentityProviderCapabilities` and `IdentityRegistrationMode` describe linking
and registration behavior; `IdentityProviderInfo` exposes it to callers.
`IdentityProviderFactory` supports configuration-driven registry construction.

Enable `identity` and import concrete implementations from
`elura::providers::identity`.

## Built-in providers

### Guest

`GuestProvider` issues short-lived HMAC-signed `GuestCredential` tokens. It
supports key rotation through `new_rotating`; secrets must be at least 32 bytes.
Use it for device or trial identities, then bind progression to a durable account
before the guest credential expires.

#### Usage example

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

Resolve the verified identity through `IdentityBindingStore`; do not send the
guest token directly to the Gateway.

### Password

`PasswordProvider<R>` accepts `PasswordCredential` and uses an application
implementation of `PasswordCredentialStore`. `hash_password` uses Argon2 and
`normalize_username` applies the provider's canonical username rules. Store only
password hashes, rate-limit attempts, and return indistinguishable errors for
unknown users and invalid passwords.

#### Usage example

```rust
use elura::providers::identity::{
    IdentityRegistry, PasswordCredential, PasswordProvider,
};

// password_store implements PasswordCredentialStore.
let provider = PasswordProvider::new(password_store)?;
let registry = IdentityRegistry::new();
registry.register(provider)?;

let identity = registry
    .authenticate("password", PasswordCredential::new("alice", submitted_password))
    .await?;
```

Create hashes with `hash_password` before storing new credentials. The Provider
never needs access to plaintext passwords outside the current request.

### Phone

`PhoneProvider<V>` accepts `PhoneCredential` and delegates one-time-code
verification to `OtpVerifier`. Login and account linking use distinct purposes,
so the verifier must preserve purpose binding.

#### Usage example

```rust
use elura::providers::identity::{IdentityRegistry, PhoneCredential, PhoneProvider};

// otp_service implements OtpVerifier.
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

Use `IdentityService::link` for the `bind_phone` purpose instead of reusing the
login path.

### OAuth 2.0

`OAuth2Provider` performs authorization-code exchange with PKCE using
`OAuth2Config` and `OAuth2Credential`. `CodeExchangeProvider` uses
`CodeExchangeConfig` and `CodeCredential` for compatible JSON exchange
endpoints. Validate
redirect URIs and never accept an access token supplied as proof by an
untrusted client without server-side verification.

#### OAuth 2.0 example

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

Persist `state` and the PKCE verifier in the application login session and
validate them before exchanging the callback code.

#### Code-exchange example

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

The exchange endpoint must use HTTPS and return the configured subject field.

### WeChat

`WechatIdentity` exchanges a login code using `PlatformIdentityConfig` and
returns the platform OpenID plus UnionID when supplied. Its registry name is
`wechat`.

#### Usage example

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

`WechatMiniIdentity` performs `jscode2session`-style exchange. Its registry name
is `wechat_mini`; keep the app secret server-side and treat the returned session
material as sensitive.

#### Usage example

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

`DouyinIdentity` exchanges the platform code and normalizes OpenID/UnionID. Its
registry name is `douyin`.

#### Usage example

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

`QuickSdkIdentity` validates `QuickSdkCredential` with the configured product,
channel, and callback keys. Its registry name is `quicksdk`; configure
`QuickSdkIdentityConfig` per application environment.

#### Usage example

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

## Application flow

The built-in HTTP path connects identity providers without asking the player to
log in again:

1. `POST /elura/auth/login` sends a provider name and provider-specific JSON
   credential to `HttpAuthApi`.
2. `IdentityHttpBackend` calls `IdentityService::login` exactly once and
   resolves the existing application account through `IdentityBindingStore`.
3. The application `IdentityHttpPolicy` grants HTTP scopes and, when requested,
   verifies the selected player, region, and realm.
4. The response contains reusable HTTP access credentials, a rotating refresh
   token, and optionally the first short-lived, single-use Gateway login
   ticket.
5. Later, `POST /elura/game/session-ticket` exchanges a valid bearer token for
   another one-time Gateway login ticket without another provider login.

```rust
use elura::prelude::{IdentityHttpBackend, IdentityHttpPolicy};

let login_backend = Arc::new(IdentityHttpBackend::new(
    identity_service,
    Arc::new(GameIdentityPolicy::new(account_store)),
));
let auth_api = HttpAuthApi::new(http_tokens, tickets, shared_replay, login_backend);
```

Provider authentication proves an external identity; it does not by itself
authorize a game session. `IdentityHttpPolicy::game_identity` must verify
account ownership and admission policy before a ticket is issued.

The adapter deliberately implements existing-account login only. Registration
and linking remain explicit application flows; do not retry a failed login as
registration because OAuth and platform authorization codes may be single-use.
After ELR2 authentication, Gateway returns and rotates reconnect tickets. The
identity provider and HTTP access token do not replace reconnect tickets.

Applications that do not use `HttpAuthApi` can still authenticate through
`IdentityService` and issue tickets directly with `TicketService`.
