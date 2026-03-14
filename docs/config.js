import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ReportForge',
  description: 'Crystal Reports-compatible visual report designer',
  themeConfig: {
    nav: [
      { text: 'Designer', link: '/designer/' },
      { text: 'Architecture', link: '/architecture/' },
      { text: 'API', link: '/api/designer' },
    ],
    sidebar: {
      '/designer/': [
        { text: 'Getting Started', link: '/designer/' },
      ],
      '/architecture/': [
        { text: 'Module Overview',  link: '/architecture/' },
        { text: 'CR Fidelity Refactor', link: '/architecture/refactor' },
      ],
      '/api/': [
        { text: 'Designer API', link: '/api/designer' },
      ],
    },
    socialLinks: [],
  }
})
