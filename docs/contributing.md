# Contributing documentation and integrations

The documentation is a VitePress project. Keep explanations task-oriented and
derive defaults, limits, field names, and API behavior from the adjacent Elura
source repository.

## Preview changes

```bash
npm install
npm run docs:dev
```

Before opening a pull request:

```bash
npm run docs:build
```

Also check that every page intended for navigation appears in
`docs/.vitepress/config.mts` and that relative links resolve from the source
page.

## Writing conventions

- Write in English and use sentence-style headings.
- Refer to the product as **Elura**, a process as **Gateway** or **World**, and
protocol frames/routes in code formatting.
- Prefer runnable commands and source-backed examples.
- Distinguish runtime behavior from generated-application behavior.
- Do not document secrets, real endpoints, or organization-specific credentials.
- Call out `0.x` compatibility risks when showing version-sensitive APIs.

## Keeping source and docs aligned

Review the documentation when changing:

- public configuration structs or defaults;
- protocol constants, frame validation, or reserved routes;
- CLI targets and generated templates;
- feature flags or workspace crates;
- admin endpoints, bodies, authentication, or status codes;
- deployment manifests, health behavior, or metrics;
- adapters and provider capabilities.

Item-level API documentation belongs in Rustdoc. This site should explain how
components fit together, how to operate them, and which trade-offs an
application must make.

## Contributing Providers and Adapters

Reusable Provider and Adapter implementations are welcome in the
[Elura repository](https://github.com/Arion-Dsh/horizon-rs). Keep
organization-specific policy in the application, but prefer an upstream PR when
the integration implements a public protocol or generally useful
infrastructure capability.

Before submitting code, follow the domain checklist for
[Providers](/providers/custom#contribute-upstream) or
[Adapters](/adapters/custom#contribute-upstream). Every accepted integration
should remain opt-in, preserve the core contract's semantics, include failure
and security tests, expose a reviewable public API, and update Rustdoc plus both
site languages in the same change.
