import { defineConfig } from 'vitepress'

const base = process.env.DOCS_BASE ?? '/'

const enNav = [
  { text: 'Start', link: '/guide/quick-start' },
  { text: 'Guides', link: '/guides/' },
  { text: 'Concepts', link: '/concepts/' },
  { text: 'Adapters', link: '/adapters/' },
  { text: 'Providers', link: '/providers/' }
]

const zhNav = [
  { text: '开始', link: '/zh/guide/quick-start' },
  { text: '指南', link: '/zh/guides/' },
  { text: '概念', link: '/zh/concepts/' },
  { text: 'Adapters', link: '/zh/adapters/' },
  { text: 'Providers', link: '/zh/providers/' }
]

const enStartSidebar = [
  {
    text: 'Start',
    items: [
      { text: 'Overview', link: '/' },
      { text: 'Quick start', link: '/guide/quick-start' },
      { text: 'Generated project', link: '/guide/generated-project' },
      { text: 'CLI commands', link: '/guide/cli' }
    ]
  },
  {
    text: 'Manual setup',
    items: [
      { text: 'Single process', link: '/guide/manual-monolith' },
      { text: 'Split Gateway and World', link: '/guide/manual-setup' },
      { text: 'Distributed setup', link: '/guide/manual-distributed' }
    ]
  }
]

const enProvidersSidebar = [{
  text: 'Providers',
  items: [
    { text: 'Overview', link: '/providers/' },
    { text: 'Identity', link: '/providers/identity' },
    { text: 'OTP', link: '/providers/otp' },
    { text: 'Notifications', link: '/providers/notifications' },
    { text: 'Payments', link: '/providers/payments' },
    { text: 'Custom providers', link: '/providers/custom' }
  ]
}]

const enAdaptersSidebar = [{
  text: 'Adapters',
  items: [
    { text: 'Overview', link: '/adapters/' },
    { text: 'Discovery', link: '/adapters/discovery' },
    { text: 'Shared state', link: '/adapters/state' },
    { text: 'Online presence', link: '/adapters/online' },
    { text: 'Messaging and control', link: '/adapters/messaging' },
    { text: 'Admission', link: '/adapters/admission' },
    { text: 'Outbox', link: '/adapters/outbox' },
    { text: 'Kubernetes', link: '/adapters/kubernetes' },
    { text: 'Redis operations', link: '/adapters/redis' },
    { text: 'Custom adapters', link: '/adapters/custom' }
  ]
}]

const enGuidesSidebar = [
  {
    text: 'Build',
    items: [
      { text: 'Overview', link: '/guides/' },
      { text: 'World modules and routes', link: '/guides/world-development' },
      { text: 'Realtime gameplay', link: '/guides/realtime-gameplay' },
      { text: 'Client transports', link: '/guides/transports' },
      { text: 'Application HTTP', link: '/guides/application-http' },
      { text: 'Client SDKs', link: '/guides/client-sdks' },
      { text: 'Configuration', link: '/guides/configuration' },
      { text: 'Environment variables', link: '/reference/environment' },
      { text: 'Features and imports', link: '/reference/crates-and-features' },
      { text: 'Rust API (docs.rs)', link: 'https://docs.rs/elura' }
    ]
  },
  {
    text: 'Ship',
    items: [
      { text: 'Distributed infrastructure', link: '/guides/distributed' },
      { text: 'Deployment', link: '/guides/deployment' },
      { text: 'Operations', link: '/guides/operations' },
      { text: 'Admin HTTP API', link: '/reference/admin-api' },
      { text: 'Production checklist', link: '/reference/production-checklist' }
    ]
  }
]

const enConceptsSidebar = [{
  text: 'Concepts',
  items: [
    { text: 'Overview', link: '/concepts/' },
    { text: 'Architecture', link: '/concepts/architecture' },
    { text: 'Sessions and routing', link: '/concepts/sessions-and-routing' },
    { text: 'ELR2 protocol', link: '/concepts/protocol' }
  ]
}]

const zhStartSidebar = [
  {
    text: '开始',
    items: [
      { text: '概览', link: '/zh/' },
      { text: '快速开始', link: '/zh/guide/quick-start' },
      { text: '生成的项目', link: '/zh/guide/generated-project' },
      { text: 'CLI 命令', link: '/zh/guide/cli' }
    ]
  },
  {
    text: '手动搭建',
    items: [
      { text: '单进程', link: '/zh/guide/manual-monolith' },
      { text: '拆分 Gateway 与 World', link: '/zh/guide/manual-setup' },
      { text: '分布式', link: '/zh/guide/manual-distributed' }
    ]
  }
]

const zhProvidersSidebar = [{
  text: 'Providers',
  items: [
    { text: '概览', link: '/zh/providers/' },
    { text: '身份认证', link: '/zh/providers/identity' },
    { text: 'OTP', link: '/zh/providers/otp' },
    { text: '通知', link: '/zh/providers/notifications' },
    { text: '支付', link: '/zh/providers/payments' },
    { text: '自定义 Provider', link: '/zh/providers/custom' }
  ]
}]

const zhAdaptersSidebar = [{
  text: 'Adapters',
  items: [
    { text: '概览', link: '/zh/adapters/' },
    { text: '服务发现', link: '/zh/adapters/discovery' },
    { text: '共享状态', link: '/zh/adapters/state' },
    { text: '在线状态', link: '/zh/adapters/online' },
    { text: '消息与控制', link: '/zh/adapters/messaging' },
    { text: '准入控制', link: '/zh/adapters/admission' },
    { text: 'Outbox', link: '/zh/adapters/outbox' },
    { text: 'Kubernetes', link: '/zh/adapters/kubernetes' },
    { text: 'Redis 运维', link: '/zh/adapters/redis' },
    { text: '自定义 Adapter', link: '/zh/adapters/custom' }
  ]
}]

const zhGuidesSidebar = [
  {
    text: '开发',
    items: [
      { text: '概览', link: '/zh/guides/' },
      { text: 'World 模块与路由', link: '/zh/guides/world-development' },
      { text: '实时游戏开发', link: '/zh/guides/realtime-gameplay' },
      { text: '客户端传输', link: '/zh/guides/transports' },
      { text: '应用 HTTP', link: '/zh/guides/application-http' },
      { text: '客户端 SDK', link: '/zh/guides/client-sdks' },
      { text: '配置', link: '/zh/guides/configuration' },
      { text: '环境变量', link: '/zh/reference/environment' },
      { text: '功能开关与导入', link: '/zh/reference/crates-and-features' },
      { text: 'Rust API（docs.rs）', link: 'https://docs.rs/elura' }
    ]
  },
  {
    text: '交付',
    items: [
      { text: '分布式基础设施', link: '/zh/guides/distributed' },
      { text: '部署', link: '/zh/guides/deployment' },
      { text: '运维', link: '/zh/guides/operations' },
      { text: '管理 HTTP API', link: '/zh/reference/admin-api' },
      { text: '生产检查清单', link: '/zh/reference/production-checklist' }
    ]
  }
]

const zhConceptsSidebar = [{
  text: '概念',
  items: [
    { text: '概览', link: '/zh/concepts/' },
    { text: '架构', link: '/zh/concepts/architecture' },
    { text: '会话与路由', link: '/zh/concepts/sessions-and-routing' },
    { text: 'ELR2 协议', link: '/zh/concepts/protocol' }
  ]
}]

const enSidebar = {
  '/providers/': enProvidersSidebar,
  '/adapters/': enAdaptersSidebar,
  '/guides/': enGuidesSidebar,
  '/concepts/': enConceptsSidebar,
  '/reference/': enGuidesSidebar,
  '/guide/cli': enStartSidebar,
  '/guide/': enStartSidebar,
  '/': enStartSidebar
}

const zhSidebar = {
  '/zh/providers/': zhProvidersSidebar,
  '/zh/adapters/': zhAdaptersSidebar,
  '/zh/guides/': zhGuidesSidebar,
  '/zh/concepts/': zhConceptsSidebar,
  '/zh/reference/': zhGuidesSidebar,
  '/zh/guide/cli': zhStartSidebar,
  '/zh/guide/': zhStartSidebar,
  '/zh/': zhStartSidebar
}

export default defineConfig({
  title: 'Elura',
  titleTemplate: ':title | Elura',
  description: 'An open-source, modular Rust framework for authoritative realtime gameplay and extensible online game services.',
  base,
  cleanUrls: true,
  sitemap: {
    hostname: 'https://elura.rustyspottedcat.dev/'
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      link: '/',
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar
      }
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      title: 'Elura',
      titleTemplate: ':title | Elura 中文文档',
      description: 'Elura 是面向权威实时玩法与可扩展在线游戏服务的开源模块化 Rust 框架。',
      themeConfig: {
        nav: zhNav,
        sidebar: zhSidebar,
        outline: { level: [2, 3], label: '本页内容' },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: { text: '最后更新' },
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色主题',
        darkModeSwitchTitle: '切换到深色主题',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '返回顶部',
        langMenuLabel: '切换语言',
        skipToContentLabel: '跳到正文',
        editLink: {
          pattern: 'https://github.com/Arion-Dsh/elura-docs/edit/main/docs/:path',
          text: '在 GitHub 上编辑本页'
        },
        footer: {
          message: '基于 MIT 许可证发布。',
          copyright: 'Copyright © Elura contributors'
        }
      }
    }
  },
  head: [
    ['meta', { name: 'theme-color', content: '#081512' }],
    ['meta', { name: 'keywords', content: 'Elura, Rust game server, online game server, Rust gateway, multiplayer backend, game networking' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Elura Documentation' }],
    ['meta', { property: 'og:description', content: 'An open-source, modular Rust framework for authoritative realtime gameplay and extensible online game services.' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: 'Elura Documentation' }],
    ['meta', { name: 'twitter:description', content: 'An open-source, modular Rust framework for authoritative realtime gameplay and extensible online game services.' }]
  ],
  themeConfig: {
    siteTitle: 'Elura',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Arion-Dsh/elura' }
    ],
    editLink: {
      pattern: 'https://github.com/Arion-Dsh/elura-docs/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: {
                buttonText: '搜索',
                buttonAriaLabel: '搜索文档'
              },
              modal: {
                displayDetails: '显示详细列表',
                resetButtonTitle: '清除查询',
                backButtonTitle: '关闭搜索',
                noResultsText: '没有找到相关结果',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车',
                  navigateText: '切换',
                  navigateUpKeyAriaLabel: '向上',
                  navigateDownKeyAriaLabel: '向下',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Esc'
                }
              }
            }
          }
        }
      }
    },
    outline: { level: [2, 3], label: 'On this page' },
    docFooter: { prev: 'Previous page', next: 'Next page' },
    lastUpdated: { text: 'Last updated' },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Elura contributors'
    }
  },
  markdown: {
    lineNumbers: true
  },
  lastUpdated: true
})
