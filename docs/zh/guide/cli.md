# CLI 参考

`elura` 是项目脚手架工具。它不会启动服务器，并且除非传入 `--force`，否则
不会修改已有文件。

CLI 并非必需：[手动搭建](./manual-setup)展示如何直接使用 Rust 源码和 JSON
配置创建可运行的 Gateway 与 World。

## 通用语法

```text
elura init <TARGET> [OPTIONS]
```

通用选项：

| 选项 | 含义 |
| --- | --- |
| `-d, --dir <PATH>` | 输出目录，默认为 `.` |
| `-f, --force` | 覆盖已存在的生成路径 |
| `--dry-run` | 只显示创建、覆盖和冲突，不写文件 |
| `-h, --help` | 显示当前上下文帮助 |

使用 `elura help init <target>` 查看目标专属帮助。

## 生成目标

| 目标 | 输出 |
| --- | --- |
| `config` | 运行时 JSON、环境变量示例和配置说明 |
| `gateway` | `src/bin/gateway.rs` |
| `world` | `src/bin/world.rs` |
| `monolith` | 单体入口、JSON 配置和 Compose 文件 |
| `module` | 指定名称的 World 模块骨架 |
| `route` | 类型化 Rust 路由与 protobuf 定义 |
| `sdk` | C++17、.NET 8/C# 与 TypeScript ELR2 协议库 |
| `docker` | Docker Compose 文件与环境变量示例 |
| `k8s` | Kubernetes/Kustomize 基础配置；`kubernetes` 是别名 |
| `all` | 项目清单、配置、Gateway、World、Docker 和 Kubernetes |

## 生成模块

名称必须以小写 ASCII 字母开头，并且只能包含小写字母、数字和下划线。

```bash
elura init module --name inventory --dir .
```

命令会创建 `src/world/inventory/mod.rs`。将模块加入应用模块树，并通过
`World::install`（或 `Monolith::install`）安装。

## 生成路由

应用路由 ID 从 `100` 开始。`1` 到 `4` 由运行时保留，低于 `100` 的其他值
保留给未来协议扩展。

```bash
elura init route \
  --module inventory \
  --name equip_item \
  --id 120 \
  --dir .
```

生成：

```text
proto/inventory/v2/equip_item.proto
src/world/inventory/equip_item.rs
```

生成器不会修改 `mod.rs` 或 `build.rs`。生成的 Rust 文件包含该路由的 `Route`
实现和注册函数。请在应用中显式接入新模块，使路由所有权保持清晰可审查。

## 生成客户端协议 SDK

一次生成全部三套客户端库：

```bash
elura init sdk --dir .
```

也可以通过 `--language cpp`、`--language csharp` 或
`--language typescript` 只选择一种语言。输出位于 `sdk/<language>/`，包含
ELR2 帧编解码器、Gateway 内置契约、Session Control protobuf 和黄金向量测试。
Socket 生命周期和应用路由分发仍由客户端负责。

传输规则和测试命令见[客户端协议 SDK](../guides/client-sdks)。

## 安全地重新生成

更新基础设施前先执行 dry run：

```bash
elura init k8s --dir . --dry-run
```

如果存在冲突，先比较自定义文件与当前模板，再决定是否使用 `--force`。
生成文件属于应用代码，不是可随意丢弃的构建产物。
