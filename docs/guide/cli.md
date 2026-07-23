# CLI commands

The `elura` binary is a project scaffolding tool. It never starts a server and
does not modify existing files unless `--force` is supplied.

It is optional: [Manual setup](./manual-setup) shows how to create a working
Gateway and World directly from Rust source and JSON configuration.

## General syntax

```text
elura init <TARGET> [OPTIONS]
```

Common options:

| Option | Meaning |
| --- | --- |
| `-d, --dir <PATH>` | Output directory; defaults to `.` |
| `-f, --force` | Overwrite generated paths that already exist |
| `--dry-run` | Show create/overwrite/conflict actions without writing |
| `-h, --help` | Show contextual help |

Use `elura help init <target>` for target-specific help.

## Targets

| Target | Output |
| --- | --- |
| `config` | Runtime JSON, environment examples, and configuration notes |
| `gateway` | `src/bin/gateway.rs` |
| `world` | `src/bin/world.rs` |
| `monolith` | Monolith entry point, JSON config, and Compose file |
| `module` | A named World module skeleton |
| `route` | A typed Rust route plus protobuf definition |
| `sdk` | C++20, Unity-compatible C# 9 / .NET Standard 2.1, and TypeScript ELR2 libraries |
| `docker` | Docker Compose files and environment example |
| `k8s` | Kubernetes/Kustomize base; `kubernetes` is an alias |
| `all` | Project manifest, config, Gateway, World, Docker, and Kubernetes |

## Generate a module

Names must start with a lowercase ASCII letter and contain only lowercase
letters, digits, or underscores.

```bash
elura init module --name inventory --dir .
```

This creates `src/world/inventory/mod.rs`. Add the new module to the
application’s module tree and install it with `World::install` (or
`Monolith::install`).

## Generate a route

Application route IDs start at `100`. IDs `1` through `4` are reserved by the
runtime, and the remainder below `100` is reserved for future protocol use.

```bash
elura init route \
  --module inventory \
  --name equip_item \
  --id 120 \
  --dir .
```

This creates:

```text
proto/inventory/v2/equip_item.proto
src/world/inventory/equip_item.rs
```

The generator does not edit `mod.rs` or `build.rs`. The generated Rust file
contains the route's `Route` implementation and registration function. Wire
the new module into your application explicitly so route ownership remains
reviewable.

## Generate client protocol SDKs

Generate all three supported client libraries:

```bash
elura init sdk --dir .
```

Or select one language with `--language cpp`, `--language csharp`, or
`--language typescript`. The output lives under `sdk/<language>/` and includes
ELR2 frame codecs, built-in Gateway contracts, Session Control protobuf, and
golden-vector tests. Socket ownership and application-route dispatch remain in
your client.

See [Client protocol SDKs](../guides/client-sdks) for transport rules and test
commands.

## Safe regeneration

Use a dry run before updating generated infrastructure:

```bash
elura init k8s --dir . --dry-run
```

If files conflict, compare your customized versions with the current templates
before using `--force`. Generated files are application code, not disposable
build artifacts.
