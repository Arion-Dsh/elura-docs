---
outline: 2
---

# 快速开始：运行第一个 Elura 服务

大约 10 分钟内，你将生成一个应用，启动 World 与 Gateway，并通过健康接口验证
两个进程。

::: tip 最终会得到什么
一个完全属于你的普通 Rust 应用：可编辑的源码、本地 JSON 配置、部署文件和
`elura` 依赖。生成器不会用自己的运行命令隐藏你的项目。
:::

希望自己创建每个文件？可选择[单体](./manual-monolith)、
[拆分](./manual-setup)或[分布式](./manual-distributed)手动教程。它们使用相同
公共 API，CLI 只是减少脚手架工作。

## 开始之前

需要 Rust `1.97` 或更高版本，并确保 `cargo` 已加入 `PATH`。本指南不需要 Docker
或 Kubernetes。

检查工具链：

```bash
rustc --version
cargo --version
```

## 1. 安装生成器

```bash
cargo install elura-cli
elura --version
```

`elura` 命令只负责生成项目文件；你的服务仍然是普通 Cargo 应用。

## 2. 生成应用

```bash
mkdir my-game
cd my-game
elura init all --dir .
```

该命令会创建 Gateway 与 World 二进制入口、开发配置和部署示例。除非传入
`--force`，否则不会覆盖已有文件。

想先查看文件计划？

```bash
elura init all --dir . --dry-run
```

生成的 Gateway 配置使用 Compose 服务名 `world:18000`。本教程直接在宿主机
运行两个进程，因此请将 `config/gateway.json` 中的 `discovery.endpoint`
改为：

```json
"endpoint": "127.0.0.1:18000"
```

使用生成的 Docker Compose 文件时，再改回 `world:18000`。

## 3. 创建开发密钥

复制环境变量模板：

```bash
cp config/elura.env.example config/elura.env
```

运行下面的命令三次，生成三个不同的值：

```bash
openssl rand -hex 32
```

打开 `config/elura.env`，替换 `APP_TICKET_KEY`、`APP_INTERNAL_TOKEN` 和
`APP_ADMIN_TOKEN`。每个值都必须至少包含 32 字节，而且票据密钥与内部令牌不能
相同。

::: warning 密钥只保存在本地
生成项目已忽略 `config/elura.env`。不要提交真实文件，也不要在生产环境复用开发
密钥。
:::

## 4. 启动 World 与 Gateway

在生成的项目目录中打开两个终端。两个终端都要加载同一个环境变量文件。

::: code-group

```bash [终端 1 — World]
set -a
. config/elura.env
set +a
cargo run --bin world
```

```bash [终端 2 — Gateway]
set -a
. config/elura.env
set +a
cargo run --bin gateway
```

:::

先启动 World，确认它就绪后，再在第二个终端启动 Gateway。首次运行时 Cargo
需要编译依赖，可能会等待几分钟。

## 5. 验证结果

在第三个终端检查管理接口：

```bash
curl -i http://127.0.0.1:18001/elura/healthz
curl -i http://127.0.0.1:17001/elura/healthz
curl -i http://127.0.0.1:17001/elura/readyz
```

健康的接口会返回 `204 No Content`。此时本地拓扑如下：

| 进程 | 地址 | 作用 |
| --- | --- | --- |
| Gateway | `127.0.0.1:17000` | 接收客户端 ELR2 连接 |
| Gateway 管理服务 | `127.0.0.1:17001` | 健康、就绪、指标和诊断 |
| World | `127.0.0.1:18000` | 执行已认证的游戏命令 |
| World 管理服务 | `127.0.0.1:18001` | 健康、就绪、指标和诊断 |

## 更喜欢单进程开发？

完成以上步骤后，可以生成并运行单体模式：

```bash
elura init monolith --dir .
set -a
. config/elura.env
set +a
cargo run --bin monolith
```

单体模式适合项目早期开发。需要测试服务发现、网络行为和独立扩缩容时，再使用
拆分的 Gateway 与 World。

## 遇到问题时

| 现象 | 检查项 |
| --- | --- |
| 提示“must contain at least 32 bytes” | 将 `config/elura.env` 中的所有占位符替换为生成的值。 |
| Gateway 一直未就绪 | 先启动 World，并确保两个进程使用相同的 `APP_INTERNAL_TOKEN`。 |
| 提示“address already in use” | 停止旧进程，或修改 `config/*.json` 中的监听地址。 |
| 一个终端正常、另一个失败 | 两个终端需要分别加载 `config/elura.env`。 |

## 编写第一个游戏命令

生成的 World 已包含一个类型化 Handler 示例。打开 `src/bin/world.rs`，然后按照
[World 模块与路由](/zh/guides/world-development)将它替换成自己的请求和响应。

接下来可以：

- [看懂生成的文件](./generated-project)。
- [理解 Gateway 与 World 的边界](/zh/concepts/architecture)。
- [加入 Redis、SQL、DNS 或 Kubernetes](/zh/guides/distributed)。
