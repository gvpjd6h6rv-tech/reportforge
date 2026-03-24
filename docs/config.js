import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ReportForge',
  description: 'Designer visual, runtime canónico y arquitectura gobernada de ReportForge',
  themeConfig: {
    nav: [
      { text: 'Brochure', link: '/brochure' },
      { text: 'Designer', link: '/guide/designer' },
      { text: 'Architecture', link: '/architecture/overview' },
      { text: 'API', link: '/api/designer' },
    ],
    sidebar: {
      '/guide/': [
        { text: '🚀 Getting Started', link: '/guide/getting-started' },
        { text: '🖥️ Designer', link: '/guide/designer' },
        { text: '⌨️ Shortcuts', link: '/guide/shortcuts' },
        { text: '🧮 Formulas', link: '/guide/formulas' },
        { text: '🧱 Sections', link: '/guide/sections' },
      ],
      '/architecture/': [
        { text: '🏗️ Overview', link: '/architecture/overview' },
        { text: '🧩 Modules', link: '/architecture/modules' },
        { text: '📐 Contracts', link: '/architecture/contracts' },
        { text: '🧭 Runtime Canonicity', link: '/architecture/runtime-canonicity' },
        { text: '🧪 QA Pipeline', link: '/architecture/qa-pipeline' },
        { text: '🧱 Layers', link: '/layers' },
        { text: '🛰️ RuntimeServices', link: '/runtime-services' },
        { text: '🛡️ Governance', link: '/governance' },
      ],
      '/api/': [
        { text: '🔌 Designer API', link: '/api/designer' },
      ],
      '/': [
        { text: '🎪 Brochure', link: '/brochure' },
        { text: '🏠 Home', link: '/' },
        { text: '🧱 Architecture', link: '/architecture/overview' },
      ],
    },
    socialLinks: [],
  }
})
