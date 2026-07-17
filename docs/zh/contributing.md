# 贡献文档与集成

本站使用 VitePress。说明应面向任务，并从相邻 Elura 源码仓库中获取默认值、
限制、字段名称和 API 行为。

## 预览修改

```bash
npm install
npm run docs:dev
```

提交 Pull Request 前：

```bash
npm run docs:build
```

同时确认需要出现在导航中的页面已加入 `docs/.vitepress/config.mts`，并且相对
链接可以从源页面正确解析。

## 编写约定

- 中文页面使用简体中文和句式标题，英文页面继续使用英文。
- 产品写作 **Elura**，进程写作 **Gateway** 或 **World**，协议帧和路由使用
  代码格式。
- 优先提供可运行命令和有源码依据的示例。
- 明确区分运行时行为与生成应用行为。
- 不记录真实密钥、端点或组织内部凭据。
- 展示版本敏感 API 时说明 `0.x` 兼容性风险。
- 修改英文功能说明时同步检查对应中文页面，反之亦然。

## 保持源码与文档一致

修改以下内容时应检查文档：

- 公共配置结构或默认值；
- 协议常量、帧验证或保留路由；
- CLI 目标与生成模板；
- 功能开关或 Workspace Crate；
- 管理端点、请求体、认证或状态码；
- 部署清单、健康行为或指标；
- 适配器与 Provider 能力。

条目级 API 文档属于 Rustdoc。本站主要解释组件如何组合、如何运维，以及应用
必须做出哪些取舍。

## 贡献 Provider 与 Adapter

欢迎向 [Elura 仓库](https://github.com/Arion-Dsh/horizon-rs)贡献可复用的
Provider 和 Adapter。组织专有策略应留在应用中；实现公开协议或通用基础设施能力
时，应优先提交上游 PR。

提交代码前请遵循[Provider](/zh/providers/custom#贡献到上游)或
[Adapter](/zh/adapters/custom#贡献到上游)清单。每个合入的集成都应保持 Opt-in、
遵守核心契约语义、包含故障与安全测试、提供可审查的 Public API，并在同一变更中
更新 Rustdoc 与中英文站点内容。
