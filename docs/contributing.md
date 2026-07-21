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

## Choose the page type first

Each page should have one primary job:

| Page type | Reader's question | Typical shape |
| --- | --- | --- |
| Tutorial | Can you help me reach a working result? | Goal, prerequisites, numbered steps, verification, troubleshooting, next steps |
| Guide | How do I complete this specific task? | Context, implementation, trade-offs, verification, related tasks |
| Concept | How does this work, and why? | Mental model, boundaries, lifecycle, failure behavior, trade-offs |
| Operations | How do I run and recover this in production? | Probes, signals, procedures, failure checks, safety notes |

Do not force every heading into every page. Keep the smallest structure that
answers the reader's question, and move unrelated material to the appropriate
page type. Tutorials and guides should end with a way to verify the result.

## Standard task-page outline

Use this outline as a starting point for tutorials and guides:

```markdown
# Task-oriented title

State the result and expected time or scope.

## Before you begin

List only required tools, versions, and existing state.

## 1. Complete the first action

Explain the action, show runnable commands or code, and identify values the
reader must replace.

## Verify the result

Show the command, response, log line, or behavior that confirms success.

## Troubleshooting

Map likely symptoms to checks or fixes.

## Next steps

Link to the next task and to relevant concept, configuration, or API pages.
```

Concept pages should not imitate a tutorial. They favor a stable mental model
and explicit boundaries. Configuration and API lookup pages should remain
compact and source-backed. Use diagrams only when they clarify a relationship
or sequence that prose cannot express as clearly.

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

## Framework performance regression

`tools/elura-load` and `tools/elura-perf` are `publish = false` internal tools
for Elura framework maintainers. They are not application dependencies and are
not part of the supported upper-layer API.

- `elura-load` drives TCP, UDP, WebSocket, QUIC, or WebTransport traffic from a
  separate process and reports framework connection, authentication, and
  request latency.
- `elura-perf` provides the reproducible HAProxy, multi-Gateway, Redis, and
  World topology used to compare framework revisions.

Use these tools only in an isolated performance environment. Their fixture
relaxes source-IP limits to permit a single load container and must not be
copied into application production configuration. Application teams should use
`WorldHarness`, `elura-testkit`, and their own deployment load-testing platform.

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
