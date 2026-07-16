import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import HomeSignal from './HomeSignal.vue'
import LogoMark from './LogoMark.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'nav-bar-title-before': () => h(LogoMark, { class: 'elura-mark--nav' }),
    'home-hero-info-before': () => h('div', { class: 'hero-lockup' }, [
      h(LogoMark, { class: 'elura-mark--hero' }),
      h('span', { class: 'hero-lockup__name' }, 'ELURA'),
      h('span', { class: 'hero-lockup__meta' }, '/ ONLINE RUNTIME')
    ]),
    'home-hero-image': () => h(HomeSignal)
  })
}
