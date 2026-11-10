import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { clearPageError, reportUnhandledError } from './lib/state'
import './style.css'

const app = createApp(App)

// 화면 코드 오류 · 잡지 않은 API 오류: 빈 화면 대신 알림을 띄우고 콘솔에 남긴다
app.config.errorHandler = (err) => reportUnhandledError(err)
window.addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault()
  reportUnhandledError(ev.reason)
})

// 다른 화면으로 가면 이전 페이지의 오류 패널은 닫는다
router.afterEach((to, from) => {
  if (to.path !== from.path) clearPageError()
})

// 새로 배포(Docker 재빌드)된 뒤 열려 있던 탭: 예전 화면 파일을 못 찾으면 새로고침해서 새 버전을 받는다
router.onError((err, to) => {
  const stale = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(err?.message || '')
  if (stale && !sessionStorage.getItem('chunk-reload')) {
    sessionStorage.setItem('chunk-reload', '1')
    location.assign(to.fullPath)
    return
  }
  reportUnhandledError(err)
})
router.afterEach(() => sessionStorage.removeItem('chunk-reload'))

app.use(router).mount('#app')
