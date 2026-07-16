import { defineConfig } from 'vitepress'

const base = process.env.DOCS_BASE ?? '/'

const enNav = [
  { text: 'Start', link: '/guide/quick-start' },
  {
    text: 'Build',
    items: [
      { text: 'Game routes', link: '/guides/world-development' },
      { text: 'Client SDKs', link: '/guides/client-sdks' },
      { text: 'Configuration', link: '/guides/configuration' },
      { text: 'Providers', link: '/guides/providers' }
    ]
  },
  {
    text: 'Deploy',
    items: [
      { text: 'Distributed infrastructure', link: '/guides/distributed' },
      { text: 'Deployment guide', link: '/guides/deployment' },
      { text: 'Operations', link: '/guides/operations' }
    ]
  },
  {
    text: 'Reference',
    items: [
      { text: 'Architecture', link: '/concepts/architecture' },
      { text: 'Feature flags', link: '/reference/crates-and-features' },
      { text: 'Rust API (docs.rs)', link: 'https://docs.rs/elura' }
    ]
  }
]

const zhNav = [
  { text: '开始', link: '/zh/guide/quick-start' },
  {
    text: '开发',
    items: [
      { text: '游戏路由', link: '/zh/guides/world-development' },
      { text: '客户端 SDK', link: '/zh/guides/client-sdks' },
      { text: '配置', link: '/zh/guides/configuration' },
      { text: '第三方服务', link: '/zh/guides/providers' }
    ]
  },
  {
    text: '部署',
    items: [
      { text: '分布式基础设施', link: '/zh/guides/distributed' },
      { text: '部署指南', link: '/zh/guides/deployment' },
      { text: '运维', link: '/zh/guides/operations' }
    ]
  },
  {
    text: '参考',
    items: [
      { text: '架构', link: '/zh/concepts/architecture' },
      { text: '功能开关', link: '/zh/reference/crates-and-features' },
      { text: 'Rust API（docs.rs）', link: 'https://docs.rs/elura' }
    ]
  }
]

const enSidebar = [
  {
    text: 'Start here',
    collapsed: false,
    items: [
      { text: 'Overview', link: '/' },
      { text: 'Quick start', link: '/guide/quick-start' },
      { text: 'Manual single process', link: '/guide/manual-monolith' },
      { text: 'Manual split setup', link: '/guide/manual-setup' },
      { text: 'Manual distributed setup', link: '/guide/manual-distributed' },
      { text: 'Generated project', link: '/guide/generated-project' },
      { text: 'Architecture overview', link: '/concepts/architecture' }
    ]
  },
  {
    text: 'Build your game',
    collapsed: false,
    items: [
      { text: 'World modules and routes', link: '/guides/world-development' },
      { text: 'Client protocol SDKs', link: '/guides/client-sdks' },
      { text: 'Configuration', link: '/guides/configuration' },
      { text: 'Providers', link: '/guides/providers' }
    ]
  },
  {
    text: 'Scale and ship',
    collapsed: true,
    items: [
      { text: 'Distributed infrastructure', link: '/guides/distributed' },
      { text: 'Deployment', link: '/guides/deployment' },
      { text: 'Operations', link: '/guides/operations' }
    ]
  },
  {
    text: 'How it works',
    collapsed: true,
    items: [
      { text: 'Sessions and routing', link: '/concepts/sessions-and-routing' },
      { text: 'ELR2 protocol', link: '/concepts/protocol' }
    ]
  },
  {
    text: 'Reference',
    collapsed: true,
    items: [
      { text: 'CLI commands', link: '/guide/cli' },
      { text: 'Features and imports', link: '/reference/crates-and-features' },
      { text: 'Environment variables', link: '/reference/environment' },
      { text: 'Admin HTTP API', link: '/reference/admin-api' },
      { text: 'Production checklist', link: '/reference/production-checklist' }
    ]
  },
  {
    text: 'Project',
    collapsed: true,
    items: [{ text: 'Contributing', link: '/contributing' }]
  }
]

const zhSidebar = [
  {
    text: '从这里开始',
    collapsed: false,
    items: [
      { text: '概览', link: '/zh/' },
      { text: '快速开始', link: '/zh/guide/quick-start' },
      { text: '手动单体搭建', link: '/zh/guide/manual-monolith' },
      { text: '手动拆分搭建', link: '/zh/guide/manual-setup' },
      { text: '手动分布式搭建', link: '/zh/guide/manual-distributed' },
      { text: '生成的项目', link: '/zh/guide/generated-project' },
      { text: '架构概览', link: '/zh/concepts/architecture' }
    ]
  },
  {
    text: '开发游戏',
    collapsed: false,
    items: [
      { text: 'World 模块与路由', link: '/zh/guides/world-development' },
      { text: '客户端协议 SDK', link: '/zh/guides/client-sdks' },
      { text: '配置', link: '/zh/guides/configuration' },
      { text: '第三方服务', link: '/zh/guides/providers' }
    ]
  },
  {
    text: '扩展与交付',
    collapsed: true,
    items: [
      { text: '分布式基础设施', link: '/zh/guides/distributed' },
      { text: '部署', link: '/zh/guides/deployment' },
      { text: '运维', link: '/zh/guides/operations' }
    ]
  },
  {
    text: '工作原理',
    collapsed: true,
    items: [
      { text: '会话与路由', link: '/zh/concepts/sessions-and-routing' },
      { text: 'ELR2 协议', link: '/zh/concepts/protocol' }
    ]
  },
  {
    text: '参考',
    collapsed: true,
    items: [
      { text: 'CLI 命令', link: '/zh/guide/cli' },
      { text: '功能开关与导入', link: '/zh/reference/crates-and-features' },
      { text: '环境变量', link: '/zh/reference/environment' },
      { text: '管理 HTTP API', link: '/zh/reference/admin-api' },
      { text: '生产检查清单', link: '/zh/reference/production-checklist' }
    ]
  },
  {
    text: '项目',
    collapsed: true,
    items: [{ text: '贡献文档', link: '/zh/contributing' }]
  }
]

export default defineConfig({
  title: 'Elura',
  titleTemplate: ':title | Elura',
  description: 'A Rust framework for online game servers, gateways, Worlds, sessions, routing, and infrastructure integrations.',
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
      description: 'Elura 是用于在线游戏服务器、网关、World、会话、路由和基础设施集成的 Rust 框架。',
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
    ['meta', { property: 'og:description', content: 'Typed game logic, resilient networking, and infrastructure that scales when you need it.' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: 'Elura Documentation' }],
    ['meta', { name: 'twitter:description', content: 'Typed game logic, resilient networking, and infrastructure that scales when you need it.' }]
  ],
  themeConfig: {
    siteTitle: 'Elura',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Arion-Dsh/horizon-rs' }
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
