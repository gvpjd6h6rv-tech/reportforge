import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ReportForge',
  description: 'Crystal Reports-compatible visual report designer',
  srcDir: 'src',
  themeConfig: {
    logo: '📊',
    nav: [
      { text: '🖥️ Designer', link: '/designer/' },
      { text: '🏗️ Architecture', link: '/architecture/' },
      { text: '🔌 API', link: '/api/designer' },
      { text: '🔧 Workbench', link: '/workbench/' },
    ],
    sidebar: {
      '/designer/': [
        {
          text: '🚀 Getting Started',
          items: [
            { text: '⚡ Quick Start', link: '/designer/' },
            { text: '⌨️ Keyboard Shortcuts', link: '/designer/#keyboard-shortcuts' },
            { text: '📐 Section Labels', link: '/designer/#section-labels' },
            { text: '🧰 Tool Reference', link: '/designer/#tools' },
          ]
        }
      ],
      '/architecture/': [
        {
          text: '🏗️ Architecture',
          items: [
            { text: '📦 Module Overview', link: '/architecture/' },
            { text: '🎨 Modern CSS', link: '/architecture/#modern-css-architecture' },
            { text: '⚡ Event Bus', link: '/architecture/#event-bus-rfe' },
            { text: '🔄 Render Pipeline', link: '/architecture/#render-pipeline' },
          ]
        },
        {
          text: '🔧 Refactor Log',
          items: [
            { text: '✨ CR Fidelity Refactor', link: '/architecture/refactor' },
            { text: '🎨 Color Audit', link: '/architecture/refactor#color-audit' },
          ]
        }
      ],
      '/api/': [
        {
          text: '🔌 API Reference',
          items: [
            { text: '📡 Designer Endpoint', link: '/api/designer' },
            { text: '📋 Layout Schema', link: '/api/designer#layout-json-schema' },
            { text: '📦 Section Schema', link: '/api/designer#sections' },
            { text: '🧩 Element Types', link: '/api/designer#elements' },
          ]
        }
      ],
    },
    socialLinks: [],
    footer: {
      message: 'ReportForge — Crystal Reports-Compatible Designer',
    },
  }
})
