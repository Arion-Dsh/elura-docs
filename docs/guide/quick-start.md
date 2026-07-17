---
outline: 2
---

# Quick start: run your first Elura server

In about 10 minutes, you will generate an application, start a World and
Gateway, and verify both processes through their health endpoints.

::: tip What you will have
A normal Rust application that you own: editable source code, local JSON
configuration, deployment files, and an `elura` dependency. The generator does
not hide your project behind its own runtime command.
:::

Prefer to create every file yourself? Choose the
[single-process](./manual-monolith), [split](./manual-setup), or
[distributed](./manual-distributed) manual path. They use the same public APIs;
the CLI only saves scaffolding work.

## Before you begin

You need Rust `1.97` or newer and `cargo` on your `PATH`. Docker and Kubernetes
are not required for this guide.

Check your toolchain:

```bash
rustc --version
cargo --version
```

## 1. Install the generator

```bash
cargo install elura-cli
elura --version
```

The `elura` command only generates project files; your server remains a normal
Cargo application.

## 2. Generate an application

```bash
mkdir my-game
cd my-game
elura init all --dir .
```

This creates Gateway and World binaries, development configuration, and
deployment examples. It does not overwrite existing files unless you pass
`--force`.

Want to inspect the file plan first?

```bash
elura init all --dir . --dry-run
```

The generated Gateway configuration uses the Compose service name
`world:18000`. Because this guide runs both processes directly on the host,
change `discovery.endpoint` in `config/gateway.json` to:

```json
"endpoint": "127.0.0.1:18000"
```

Change it back to `world:18000` when using the generated Docker Compose file.

## 3. Create development secrets

Copy the environment template:

```bash
cp config/elura.env.example config/elura.env
```

Generate three different values by running this command three times:

```bash
openssl rand -hex 32
```

Open `config/elura.env` and replace the values for `APP_TICKET_KEY`,
`APP_INTERNAL_TOKEN`, and `APP_ADMIN_TOKEN`. Each value must contain at least 32
bytes, and the ticket key and internal token must be different.

::: warning Keep secrets local
`config/elura.env` is ignored by the generated project. Never commit the real
file or reuse development secrets in production.
:::

## 4. Start World and Gateway

Open two terminals in the generated project directory. Each terminal must load
the same environment file.

::: code-group

```bash [Terminal 1 — World]
set -a
. config/elura.env
set +a
cargo run --bin world
```

```bash [Terminal 2 — Gateway]
set -a
. config/elura.env
set +a
cargo run --bin gateway
```

:::

Start the World first. When it is ready, start the Gateway in the second
terminal. The first build may take a few minutes while Cargo compiles
dependencies.

## 5. Verify the result

In a third terminal, check the admin endpoints:

```bash
curl -i http://127.0.0.1:18001/elura/healthz
curl -i http://127.0.0.1:17001/elura/healthz
curl -i http://127.0.0.1:17001/elura/readyz
```

Each healthy endpoint returns `204 No Content`. You now have this local
topology:

| Process | Address | What it does |
| --- | --- | --- |
| Gateway | `127.0.0.1:17000` | Accepts client ELR2 connections |
| Gateway admin | `127.0.0.1:17001` | Health, readiness, metrics, diagnostics |
| World | `127.0.0.1:18000` | Executes authenticated game commands |
| World admin | `127.0.0.1:18001` | Health, readiness, metrics, diagnostics |

## Prefer one local process?

After completing the steps above, you can generate and run the monolith:

```bash
elura init monolith --dir .
set -a
. config/elura.env
set +a
cargo run --bin monolith
```

The monolith is convenient during early development. The split Gateway and
World topology is more representative when testing discovery, networking, and
independent scaling.

## If something fails

| Symptom | Check |
| --- | --- |
| “must contain at least 32 bytes” | Replace every placeholder in `config/elura.env` with a generated value. |
| Gateway is not ready | Start the World first and keep both processes on the same `APP_INTERNAL_TOKEN`. |
| “address already in use” | Stop the previous process or change the listen address in `config/*.json`. |
| One terminal works and the other fails | Load `config/elura.env` separately in both terminals. |

## Build your first game command

The generated World already contains an example typed handler. Open
`src/bin/world.rs`, then follow [World modules and routes](/guides/world-development)
to replace it with your own request and response.

After that:

- [Understand the generated files](./generated-project).
- [Learn the Gateway and World boundaries](/concepts/architecture).
- [Add Redis, SQL, DNS, or Kubernetes](/guides/distributed).
