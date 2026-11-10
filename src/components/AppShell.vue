<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, LogOut } from 'lucide-vue-next'
import BrandMark from './BrandMark.vue'
import NotificationBell from './NotificationBell.vue'
import ChatBot from './ChatBot.vue'
import { api } from '@/lib/api'
import { aiState, auth, clearSession } from '@/lib/state'

const router = useRouter()
const isQuality = computed(() => auth.user?.role === 'QUALITY')
const initials = computed(() => (auth.user?.name || '').slice(-2))

const menus = computed(() =>
  isQuality.value
    ? [
        { to: '/quality/dashboard', label: '대시보드' },
        { to: '/rmas', label: 'RMA 조회' },
        { to: '/quality/patterns', label: '불량 패턴 분석' },
        { to: '/quality/recurrence', label: '알림 및 재발 관리' },
        { to: '/quality/reports', label: 'AI 보고서' },
      ]
    : [
        { to: '/cs/dashboard', label: '대시보드' },
        { to: '/rmas', label: 'RMA 조회' },
        { to: '/cs/intake', label: '반품 접수' },
      ],
)

async function checkAi() {
  try {
    const health = await api('/ai/health')
    aiState.available = health.available
    aiState.provider = health.provider
  } catch {
    /* health 실패는 배너 상태를 바꾸지 않음 */
  }
}

async function toggleAi() {
  aiState.available = (await api('/ai/toggle', { method: 'POST', body: { available: !aiState.available } })).available
}

let timer
onMounted(() => {
  checkAi()
  timer = setInterval(checkAi, 60000)
})
onBeforeUnmount(() => clearInterval(timer))

function logout() {
  clearSession()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen">
    <header class="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-[1480px] items-stretch gap-8 px-6">
        <RouterLink to="/" class="flex items-center"><BrandMark /></RouterLink>
        <nav class="flex items-stretch gap-1" aria-label="주 메뉴">
          <RouterLink
            v-for="m in menus"
            :key="m.to"
            :to="m.to"
            class="flex items-center px-3 text-sm font-semibold text-[#4a505c] transition-colors hover:text-primary"
            active-class="!text-primary shadow-[inset_0_-2px_0_var(--color-primary)]"
          >
            {{ m.label }}
          </RouterLink>
        </nav>
        <div class="ml-auto flex items-center gap-3">
          <button
            class="flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted"
            :title="`AI 엔진: ${aiState.provider || '확인 중'}. 시연용: 클릭하면 AI 서비스 장애 상황을 켜고 끕니다 (NFR-02-3)`"
            @click="toggleAi"
          >
            <span :class="aiState.available ? 'bg-emerald-500' : 'bg-red-500'" class="size-1.5 rounded-full" />
            AI {{ aiState.available ? '정상' : '장애' }}
            <span v-if="aiState.provider" class="text-muted-foreground/70">{{ aiState.provider.startsWith('gemini') ? 'Gemini' : '규칙 기반' }}</span>
          </button>
          <NotificationBell v-if="isQuality" />
          <span class="flex items-center gap-2 text-sm">
            <span class="grid size-8 place-items-center rounded-full bg-muted text-[12px] font-bold">{{ initials }}</span>
            <span class="leading-tight"><b class="block text-[14px] font-semibold">{{ auth.user?.name }}</b><span class="text-[12px] text-muted-foreground">{{ auth.user?.role_label }}</span></span>
          </span>
          <button class="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="로그아웃" title="로그아웃" @click="logout"><LogOut class="size-4" /></button>
        </div>
      </div>
      <div v-if="!aiState.available" class="border-t border-amber-200 bg-amber-50">
        <div class="mx-auto flex max-w-[1480px] items-center gap-2 px-6 py-2 text-xs text-amber-800">
          <AlertTriangle class="size-3.5" />
          <b>AI 일시 불가</b> — AI 요약, 유사 사례 분석, 챗봇, 보고서 생성이 잠시 중단되었습니다. RMA 조회, 검색, 대시보드 집계는 정상 동작합니다. (60초마다 자동 재확인)
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-[1480px] px-6 py-7">
      <slot />
    </main>
    <footer class="mx-auto flex max-w-[1480px] justify-between px-6 pb-8 text-[12px] text-[#6f7684]">
      <span>© 2026 E!ffect. RMA Intelligence Workspace.</span>
      <span>데이터 기준 SSD_RMA_3000_v18</span>
    </footer>
    <ChatBot />
  </div>
</template>
