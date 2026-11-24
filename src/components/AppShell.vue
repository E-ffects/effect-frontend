<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, LogOut, PanelRight } from 'lucide-vue-next'
import BrandMark from './BrandMark.vue'
import NotificationBell from './NotificationBell.vue'
import AgentPanel from './AgentPanel.vue'
import { api, MOCK, referenceDate } from '@/lib/api'
import { useMeta } from '@/lib/meta'
import { agentPanel, aiState, auth, clearSession, NOT_READY, setAgentPanelOpen } from '@/lib/state'

const router = useRouter()
useMeta()
const isQuality = computed(() => auth.user?.role === 'QUALITY')
const initials = computed(() => (auth.user?.name || '').slice(-2))

const menus = computed(() =>
  (isQuality.value
    ? [
        { to: '/quality/dashboard', label: '대시보드' },
        { to: '/rmas', label: 'RMA 조회' },
        { to: '/quality/approvals', label: '원인 판정' },
        { to: '/quality/patterns', label: '불량 패턴 분석' },
        { to: '/quality/recurrence', label: '알림 및 재발 관리' },
        { to: '/quality/reports', label: 'AI 보고서' },
      ]
    : [
        { to: '/cs/dashboard', label: '대시보드' },
        { to: '/rmas', label: 'RMA 조회' },
        { to: '/cs/intake', label: '반품 접수' },
      ]).filter((m) => !NOT_READY.has(m.to)),
)

async function checkAi() {
  if (!auth.token) return
  try {
    const health = await api('/ai/health')
    // Spring GET /api/ai/health: {available, provider, status, db, llm}
    // 정상·장애는 available로만 판단한다. llm=off여도 available=true면 규칙 기반으로 동작 중
    aiState.available = health.available === true
    aiState.provider = health.llm === 'ok' ? 'LLM' : '규칙 기반'
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
    <header class="sticky top-0 z-30 border-b border-[#eceef1] bg-white/90 backdrop-blur-md">
      <!-- 헤더·본문·바닥글 모두 왼쪽 24px에서 시작: 에이전트 패널이 열려도 로고와 본문 왼쪽 끝이 같은 선에 있다 -->
      <div class="flex h-16 items-stretch gap-10 px-6">
        <RouterLink to="/" class="flex items-center"><BrandMark /></RouterLink>
        <!-- 메뉴: 글자는 검정 계열, 선택 표시는 빨간 밑줄 하나만 -->
        <nav class="flex items-stretch gap-1" aria-label="주 메뉴">
          <RouterLink
            v-for="m in menus"
            :key="m.to"
            :to="m.to"
            class="flex items-center px-3 text-[15px] font-medium text-[#6b717d] transition-colors hover:text-[#111]"
            active-class="!font-bold !text-[#111] shadow-[inset_0_-2px_0_var(--color-primary)]"
          >
            {{ m.label }}
          </RouterLink>
        </nav>
        <div class="ml-auto flex items-center gap-3">
          <!-- 시연용 장애 전환(/ai/toggle)은 목업 모드에서만. 실제 연결에서는 상태 표시만 한다 -->
          <component
            :is="MOCK ? 'button' : 'span'"
            :class="MOCK ? 'hover:bg-muted' : ''"
            class="flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-[12px] text-muted-foreground"
            :title="MOCK ? `AI 엔진: ${aiState.provider || '확인 중'}. 시연용: 클릭하면 AI 서비스 장애 상황을 켜고 끕니다` : `AI 엔진: ${aiState.provider || '확인 중'}`"
            @click="MOCK && toggleAi()"
          >
            <span :class="aiState.available ? 'bg-emerald-500' : 'bg-red-500'" class="size-1.5 rounded-full" />
            AI {{ aiState.available ? '정상' : '장애' }}
            <span v-if="aiState.available && aiState.provider" class="text-muted-foreground/70">{{ aiState.provider }}</span>
          </component>
          <button
            v-if="!NOT_READY.has('chat')"
            :aria-pressed="agentPanel.open"
            :class="agentPanel.open ? 'border-brand-line bg-brand-soft text-primary' : 'text-[#4a505c] hover:bg-muted'"
            class="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold"
            @click="setAgentPanelOpen(!agentPanel.open)"
          >
            <PanelRight class="size-4" />에이전트
          </button>
          <NotificationBell v-if="isQuality && !NOT_READY.has('alerts')" />
          <span class="flex items-center gap-2 text-sm">
            <span class="grid size-8 place-items-center rounded-full bg-muted text-[12px] font-bold">{{ initials }}</span>
            <span class="leading-tight"><b class="block text-[14px] font-semibold">{{ auth.user?.name }}</b><span class="text-[12px] text-muted-foreground">{{ auth.user?.role_label }}</span></span>
          </span>
          <button class="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="로그아웃" title="로그아웃" @click="logout"><LogOut class="size-4" /></button>
        </div>
      </div>
      <div v-if="!aiState.available" class="border-t border-amber-200 bg-amber-50">
        <div class="flex items-center gap-2 px-6 py-2 text-xs text-amber-800">
          <AlertTriangle class="size-3.5" />
          <b>AI 일시 불가</b> — AI 요약과 보고서 생성이 잠시 중단되었습니다. RMA 조회, 검색, 대시보드 집계는 정상 동작합니다. (60초마다 자동 재확인)
        </div>
      </div>
    </header>
    <!-- 왼쪽 업무 화면 + 오른쪽 에이전트 패널 (데스크톱에서는 나란히, 좁은 화면에서는 패널이 위에 뜬다) -->
    <div class="flex items-start">
      <div class="min-w-0 flex-1">
        <main class="max-w-[1480px] px-6 py-7">
          <slot />
        </main>
        <footer class="flex max-w-[1480px] justify-between px-6 pb-8 text-[12px] text-[#6f7684]">
          <span>© 2026 E!ffect. RMA Intelligence Workspace.</span>
          <span>PCB RMA v5 · 기준일 {{ referenceDate }}</span>
        </footer>
      </div>
      <AgentPanel v-if="!NOT_READY.has('chat')" />
    </div>
  </div>
</template>
