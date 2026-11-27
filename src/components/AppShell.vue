<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, LogOut, PanelRight, Sparkles } from 'lucide-vue-next'
import BrandMark from './BrandMark.vue'
import NotificationBell from './NotificationBell.vue'
import AgentPanel from './AgentPanel.vue'
import { api, MOCK, referenceDate } from '@/lib/api'
import { useMeta } from '@/lib/meta'
import { agentPanel, aiState, auth, clearSession, NOT_READY, setAgentPanelOpen } from '@/lib/state'

const router = useRouter()
useMeta()
const isQuality = computed(() => auth.user?.role === 'QUALITY')
const isAdmin = computed(() => auth.user?.is_admin === true)
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
        ...(isAdmin.value ? [{ to: '/admin/users', label: '가입 승인' }] : []),
      ]
    : [
        { to: '/cs/dashboard', label: '대시보드' },
        { to: '/rmas', label: 'RMA 조회' },
        { to: '/cs/intake', label: '반품 접수' },
        ...(isAdmin.value ? [{ to: '/admin/users', label: '가입 승인' }] : []),
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

async function logout() {
  // 서버의 refresh 쿠키도 지운다. 실패해도 이 기기의 로그아웃은 진행한다
  await api('/auth/logout', { method: 'POST' }).catch(() => {})
  clearSession()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen overflow-x-clip">
    <header class="sticky top-0 z-30 border-b border-[#d5e6f7] bg-white/85 shadow-[0_8px_24px_-14px_rgb(30_80_150/0.35)] backdrop-blur-md">
      <!-- 헤더·본문·바닥글 모두 왼쪽 24px에서 시작: 에이전트 패널이 열려도 로고와 본문 왼쪽 끝이 같은 선에 있다 -->
      <div class="flex h-16 items-stretch gap-3 px-4 lg:gap-6 lg:px-6 xl:gap-10">
        <RouterLink to="/" class="flex shrink-0 items-center"><BrandMark /></RouterLink>
        <!-- 메뉴: 좁은 화면에서는 가로 스크롤로 깨짐 방지 -->
        <nav class="flex min-w-0 items-stretch gap-0.5 overflow-x-auto lg:gap-1" aria-label="주 메뉴">
          <RouterLink
            v-for="m in menus"
            :key="m.to"
            :to="m.to"
            class="flex shrink-0 items-center whitespace-nowrap px-2 text-[13.5px] font-medium text-[#6b717d] transition-colors hover:text-[#111] lg:px-3 lg:text-[15px]"
            active-class="!font-bold !text-[#111] shadow-[inset_0_-2px_0_var(--color-primary)]"
          >
            {{ m.label }}
          </RouterLink>
        </nav>
        <div class="ml-auto flex shrink-0 items-center gap-2 lg:gap-3">
          <!-- 시연용 장애 전환(/ai/toggle)은 목업 모드에서만. 실제 연결에서는 상태 표시만 한다 -->
          <component
            :is="MOCK ? 'button' : 'span'"
            :class="MOCK ? 'hover:bg-muted' : ''"
            class="hidden items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-[12px] text-muted-foreground sm:flex"
            :title="MOCK ? `AI 엔진: ${aiState.provider || '확인 중'}. 시연용: 클릭하면 AI 서비스 장애 상황을 켜고 끕니다` : `AI 엔진: ${aiState.provider || '확인 중'}`"
            @click="MOCK && toggleAi()"
          >
            <span :class="aiState.available ? 'bg-emerald-500' : 'bg-red-500'" class="size-1.5 rounded-full" />
            AI {{ aiState.available ? '정상' : '장애' }}
            <span v-if="aiState.available && aiState.provider" class="hidden text-muted-foreground/70 xl:inline">{{ aiState.provider }}</span>
          </component>
          <RouterLink
            to="/m"
            class="flex items-center gap-1 whitespace-nowrap rounded-lg bg-[#04050c] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#151828] md:hidden"
            title="모바일 AI 채팅 화면으로 이동"
          >
            <Sparkles class="size-3.5 text-cyan-300" />
            <span>AI 채팅</span>
          </RouterLink>
          <button
            v-if="!NOT_READY.has('chat')"
            :aria-pressed="agentPanel.open"
            :class="agentPanel.open ? 'border-brand-line bg-brand-soft text-primary' : 'text-[#4a505c] hover:bg-muted'"
            class="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold"
            @click="setAgentPanelOpen(!agentPanel.open)"
          >
            <PanelRight class="size-4" /><span class="hidden sm:inline">에이전트</span>
          </button>
          <NotificationBell v-if="isQuality && !NOT_READY.has('alerts')" />
          <span class="flex items-center gap-2 text-sm">
            <span class="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[12px] font-bold">{{ initials }}</span>
            <span class="hidden leading-tight md:block"><b class="block text-[14px] font-semibold">{{ auth.user?.name }}</b><span class="text-[12px] text-muted-foreground">{{ auth.user?.role_label }}</span></span>
          </span>
          <button class="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="로그아웃" title="로그아웃" @click="logout"><LogOut class="size-4" /></button>
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
        <!-- 본문은 남는 폭을 다 쓴다: 에이전트 패널을 접으면 그만큼 넓어지고 오른쪽에 빈칸이 생기지 않는다 -->
        <main class="px-4 py-5 lg:px-6 lg:py-7">
          <slot />
        </main>
        <footer class="flex flex-wrap justify-between gap-2 px-4 pb-8 text-[12px] text-[#6f7684] lg:px-6">
          <span>© 2026 E!ffect. RMA Intelligence Workspace.</span>
          <span>PCB RMA v5 · 기준일 {{ referenceDate }}</span>
        </footer>
      </div>
      <AgentPanel v-if="!NOT_READY.has('chat')" />
    </div>
  </div>
</template>
