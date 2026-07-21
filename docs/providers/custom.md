---
outline: 2
---

# Custom providers

Custom integrations implement the object-safe contract for their domain and are
registered under a stable normalized name.

| Domain | Extension contract | Registry/orchestrator |
| --- | --- | --- |
| Identity | `IdentityProvider` | `IdentityRegistry`, `IdentityService` |
| OTP delivery | `OtpSender` | `OtpService` |
| OTP verification | `OtpVerifier` | `PhoneProvider` |
| Payments | `PaymentProvider` | `PaymentRegistry` |

Keep account and order persistence outside the provider. A provider should
validate the upstream protocol, bound untrusted responses, normalize identities
or events, and return `ProviderError` with correct retryability. It should not
issue Gateway tickets or mutate game state.

## Usage example

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

Real implementations must verify external evidence; accepting a subject field
directly is only a shape example.

## Checklist

- Use a lowercase stable provider name and reject duplicate registrations.
- Define a serializable credential or request schema with unknown fields denied.
- Set precise capability flags; unsupported operations must remain unsupported.
- Apply timeouts and response-size limits to every upstream request.
- Verify signatures in constant time where relevant.
- Keep secrets out of debug output and user-facing errors.
- Add tests for malformed input, upstream failures, replay, and key rotation.

Concrete implementations remain outside the prelude by design. Import them from
`elura::providers` so reviews can see the external dependency being used.

## Contribute upstream

Keep a Provider local when it contains organization-specific policy or exists
only for one application. When it implements a reusable public integration,
opening a PR against Elura is the preferred outcome.

A Provider PR should include:

- an opt-in Cargo feature with no change to the default feature set;
- validated configuration, request timeouts, and bounded untrusted responses;
- correct capability metadata and stable normalized names;
- signature, replay, key-rotation, malformed-input, and upstream-failure tests
  relevant to the protocol;
- sanitized fixtures with no production credentials or private customer data;
- public API coverage, Rustdoc, and matching English/Chinese catalog updates.

The implementation must keep application account, order, and entitlement
policy outside the shared crate. Explain any new dependency, maintenance burden,
and upstream protocol source in the PR.
