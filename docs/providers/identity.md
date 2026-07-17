---
outline: [2, 3]
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

### Password

`PasswordProvider<R>` accepts `PasswordCredential` and uses an application
implementation of `PasswordCredentialStore`. `hash_password` uses Argon2 and
`normalize_username` applies the provider's canonical username rules. Store only
password hashes, rate-limit attempts, and return indistinguishable errors for
unknown users and invalid passwords.

### Phone

`PhoneProvider<V>` accepts `PhoneCredential` and delegates one-time-code
verification to `OtpVerifier`. Login and account linking use distinct purposes,
so the verifier must preserve purpose binding.

### OAuth 2.0

`OAuth2Provider` performs authorization-code exchange with PKCE using
`OAuth2Config` and `OAuth2Credential`. `CodeExchangeProvider` uses
`CodeExchangeConfig` and `CodeCredential` for compatible JSON exchange
endpoints. Validate
redirect URIs and never accept an access token supplied as proof by an
untrusted client without server-side verification.

### WeChat

`WechatIdentity` exchanges a login code using `PlatformIdentityConfig` and
returns the platform OpenID plus UnionID when supplied. Its registry name is
`wechat`.

### WeChat Mini Program

`WechatMiniIdentity` performs `jscode2session`-style exchange. Its registry name
is `wechat_mini`; keep the app secret server-side and treat the returned session
material as sensitive.

### Douyin

`DouyinIdentity` exchanges the platform code and normalizes OpenID/UnionID. Its
registry name is `douyin`.

### QuickSDK

`QuickSdkIdentity` validates `QuickSdkCredential` with the configured product,
channel, and callback keys. Its registry name is `quicksdk`; configure
`QuickSdkIdentityConfig` per application environment.

## Application flow

1. Receive credentials on an application HTTPS endpoint.
2. Ask `IdentityRegistry` or `IdentityService` to authenticate them.
3. Resolve or create the application account through `IdentityBindingStore`.
4. Apply application bans, region, realm, and account-version policy.
5. Create or refresh the application-owned durable login session.
6. Call `TicketService::issue_login` to issue a short-lived, single-use Elura
   Gateway login ticket.

Provider authentication proves an external identity; it does not by itself
authorize a game session.

The Gateway returns and rotates reconnect tickets after authentication. The
identity provider must not issue reconnect tickets. When a reconnect ticket is
unavailable or expired, the application validates its own refresh session and
issues another login ticket.

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

## Example: register and authenticate a guest

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

The next application step is to resolve `identity` through an
`IdentityBindingStore`, not to send this token directly to the Gateway.
