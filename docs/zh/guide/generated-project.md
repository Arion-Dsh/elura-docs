# 生成的项目

`elura init all` 会创建一个可编译的上层应用。Elura 提供模板，但生成的文件
属于你的应用，应该按业务需要继续修改。

CLI 并非必需。参阅[手动搭建](./manual-setup)，使用普通 Rust 文件组装最小的
Gateway 与 World 应用。

```text
.
├── Cargo.toml
├── Dockerfile
├── .dockerignore
├── .gitignore
├── .env.example
├── config
│   ├── README.md
│   ├── elura.env.example
│   ├── application.env.example
│   ├── gateway.json
│   ├── world.json
│   ├── distributed.json
│   └── realm-gateways.json
├── deploy
│   ├── README.md
│   ├── docker-compose.yml
│   └── kubernetes
│       ├── README.md
│       ├── kustomization.yaml
│       ├── namespace.yaml
│       ├── secret.example.yaml
│       ├── discovery-config.yaml
│       ├── gateway.yaml
│       ├── world.yaml
│       └── network-policy.yaml
└── src
    └── bin
        ├── gateway.rs
        └── world.rs
```

## 组合根

`src/bin/gateway.rs` 和 `src/bin/world.rs` 是应用的组合根。每个入口都会：

1. 定义应用自有的 `AppConfig`。
2. 读取 JSON 与环境变量。
3. 将密钥写入被 Serde 跳过的运行时配置字段。
4. 构造所选的服务发现或基础设施适配器。
5. 注册业务路由并启动 `Gateway` 或 `World`。

Elura 不会代替应用读取配置。你可以把 `AppConfig::load()` 替换成配置中心、
密钥管理器或其他文件格式，而无需修改运行时。

## 生成的默认值

JSON 文件只包含安全的非密钥开发默认值。运行时配置使用严格的
`deny_unknown_fields`，拼错的字段会在启动时失败，而不是被静默忽略。

敏感值通过环境变量注入：

- `APP_TICKET_KEY` 用于签发和验证一次性的登录与重连票据。
- `APP_INTERNAL_TOKEN` 用于认证 Gateway 到 World 的命令。
- `APP_ADMIN_TOKEN` 保护指标、调试和管理操作端点。

[环境变量](/zh/reference/environment)页列出了模板使用的全部变量。

Gateway 票据配置使用 `login_ttl` 与 `reconnect_ttl`。上层登录服务调用
`issue_login`；Gateway 认证成功响应和路由 `3` 响应提供持续轮换的重连票据。

## 依赖与功能开关

生成的清单会锁定当前 Elura 版本，并启用 `adapters` 与 `monolith`。拆分二进制
使用 Adapter 层；`monolith` Feature 让同一清单可直接配合
`elura init monolith`：

```toml
[dependencies]
prost = "0.14"
elura = { version = "0.2.10", features = ["adapters", "monolith"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal"] }
```

只启用应用真正需要的功能。`redis` 已自动启用 Adapter 层以及 Gateway、World；
只有同时构建单进程入口时才需要保留 `monolith`：

```toml
elura = { version = "0.2.10", features = ["redis"] }
```

完整矩阵见 [Crate 与功能开关](/zh/reference/crates-and-features)。
