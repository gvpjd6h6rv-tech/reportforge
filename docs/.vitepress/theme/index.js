import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import { useData } from 'vitepress'
import RptWorkbench from '../components/RptWorkbench.vue'
import BrochureHero from '../components/BrochureHero.vue'
import BrochureCards from '../components/BrochureCards.vue'
import BrochureStrip from '../components/BrochureStrip.vue'
import './custom.css'

export default {
  extends: DefaultTheme,

  Layout: () => {
    const { frontmatter } = useData()
    if (frontmatter.value?.layout === 'workbench') {
      return h(RptWorkbench)
    }
    return h(DefaultTheme.Layout)
  },

  enhanceApp({ app }) {
    app.component('RptWorkbench', RptWorkbench)
    app.component('BrochureHero', BrochureHero)
    app.component('BrochureCards', BrochureCards)
    app.component('BrochureStrip', BrochureStrip)
  }
}
