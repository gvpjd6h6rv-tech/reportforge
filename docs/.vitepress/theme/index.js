import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import { useData } from 'vitepress'
import RptWorkbench from '../components/RptWorkbench.vue'

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
  }
}
