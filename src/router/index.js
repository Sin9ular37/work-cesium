import { createRouter, createWebHistory } from 'vue-router'
import CesiumView from '../components/CesiumView.vue'

const routes = [
  {
    path: '/',
    name: 'CesiumView',
    component: CesiumView,
    meta: {
      title: '哈尔滨松北新区实景三维地图'
    }
  }
]

const router = createRouter({
  history: createWebHistory('/cesiumview/'),
  routes
})

// 路由守卫 - 设置页面标题
router.beforeEach((to, from, next) => {
  if (to.meta.title) {
    document.title = to.meta.title
  }
  next()
})

export default router 