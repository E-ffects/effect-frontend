import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { MOCK } from './lib/api'
import { auth, clearPageError, reportUnhandledError, setSession } from './lib/state'
import { vSlidePill } from './lib/slidePill'
import './style.css'

// 목업 모드(npm run dev:mock)에서는 로그인 없이 바로 화면을 연다. 주소 뒤에 ?as=cs 를 붙이면 고객대응관리자
if (MOCK && !auth.token) {
  const cs = new URLSearchParams(location.search).get('as') === 'cs'
  setSession('mock-token', { name: cs ? '고객대응 담당' : '품질 담당', role: cs ? 'CS' : 'QUALITY', role_label: cs ? '고객대응관리자' : '품질관리자' })
}

const app = createApp(App)
app.directive('slide-pill', vSlidePill)

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
