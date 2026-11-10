import { createRouter, createWebHistory } from 'vue-router'
import { auth, homePath } from './lib/state'
import { restoreQuery, saveQuery } from './lib/persist'

const routes = [
  { path: '/', redirect: () => (auth.token ? homePath() : '/login') },
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true, bare: true } },
  { path: '/signup', component: () => import('./views/SignupView.vue'), meta: { public: true, bare: true } },
  { path: '/error', component: () => import('./views/ErrorView.vue'), meta: { public: true, bare: true } },
  { path: '/quality/dashboard', component: () => import('./views/QualityDashboard.vue'), meta: { role: 'QUALITY' } },
  { path: '/cs/dashboard', component: () => import('./views/CsDashboard.vue'), meta: { role: 'CS' } },
  { path: '/rmas', component: () => import('./views/RmaList.vue') },
  { path: '/cs/intake', component: () => import('./views/IntakeView.vue'), meta: { role: 'CS' } },
  { path: '/quality/patterns', component: () => import('./views/PatternsView.vue'), meta: { role: 'QUALITY' } },
  { path: '/quality/reports', component: () => import('./views/ReportsView.vue'), meta: { role: 'QUALITY' } },
  { path: '/quality/recurrence', component: () => import('./views/RecurrenceView.vue'), meta: { role: 'QUALITY' } },
  { path: '/:pathMatch(.*)*', redirect: '/error?code=404' },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to, from) => {
  if (to.meta.public) return true
  if (!auth.token) return { path: '/login', query: { redirect: to.fullPath } }
  if (to.meta.role && to.meta.role !== auth.user?.role) return { path: '/error', query: { code: 403 } }
  return restoreQuery(to, from) || true // 필터 기억 (대시보드 기간·RMA 조회·불량 패턴·알림·재발)
})

router.afterEach((to) => saveQuery(to))

export default router
