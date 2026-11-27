<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Bell,
  ChevronLeft,
  ClipboardCheck,
  FileSearch,
  Folder,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  SquarePen,
} from 'lucide-vue-next'

/**
 * DesignBookmark "Sidebar Collapse" spring-animated drawer (Vue 3 port).
 * Springs preserved verbatim from tokens.css & side.js:
 *  - W (drawer width / slide): k=260, c=24 (--spring-soft)
 *  - R (toggle arrow rotation): k=300, c=22
 *  - Y (active highlight pill): k=380, c=28
 *  - labels (cascade opacity & slide): k=300, c=26, staggered 0.06 + i * 0.04s
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  activeTab: { type: String, default: 'chat' },
  activeScopeKey: { type: String, default: '' },
  isCs: { type: Boolean, default: false },
  user: { type: Object, default: null },
  rmaThreads: { type: Array, default: () => [] },     // [{ key, id, label, preview }]
  patternThreads: { type: Array, default: () => [] }, // [{ key, id, label, preview }]
})

const emit = defineEmits(['close', 'select-tab', 'select-thread', 'logout'])

const navItems = computed(() =>
  props.isCs
    ? [
        { id: 'chat', label: '새 채팅', icon: SquarePen },
        { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
        { id: 'rmas', label: 'RMA 조회', icon: FileSearch },
      ]
    : [
        { id: 'chat', label: '새 채팅', icon: SquarePen },
        { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
        { id: 'rmas', label: 'RMA 조회', icon: FileSearch },
        { id: 'patterns', label: '불량 패턴 분석', icon: Layers },
        { id: 'approvals', label: '원인 판정', icon: ClipboardCheck },
        { id: 'alerts', label: '알림 및 재발', icon: Bell },
      ],
)

const initials = computed(() => (props.user?.name || '사용자').slice(-2))

const DRAWER_W = 286
const sideEl = ref(null)
const backdropEl = ref(null)
const chevronEl = ref(null)
const logoEl = ref(null)
const hlEl = ref(null)
const navBtnEls = ref([])
const labelEls = ref([])

// ---- Tiny spring engine (ported from designbookmark.com/motion-src/shared/motion.js) ----
const reduce =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const S = (x, k = 400, c = 30) => ({
  x,
  v: 0,
  t: x,
  k,
  c: reduce ? 2 * Math.sqrt(k) : c,
})
const step = (s, dt) => {
  const a = -s.k * (s.x - s.t) - s.c * s.v
  s.v += a * dt
  s.x += s.v * dt
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

const W = S(props.open ? DRAWER_W : 0, 260, 24)
const R = S(props.open ? 0 : 1, 300, 22)
const Y = S(0, 380, 28)

let labelSprings = []
const timers = []
const after = (sec, fn) => {
  const t = { t: sec, fn }
  timers.push(t)
  return t
}

function clearTimers() {
  timers.length = 0
}

function syncLabelSprings() {
  const els = labelEls.value.filter(Boolean)
  labelSprings = els.map((el) => ({
    el,
    s: S(props.open ? 1 : 0, 300, 26),
  }))
}

function updateHighlight(immediate = false) {
  const idx = navItems.value.findIndex((m) => m.id === props.activeTab)
  const btn = navBtnEls.value[idx >= 0 ? idx : 0]
  if (!btn) return
  Y.t = btn.offsetTop
  if (immediate) {
    Y.x = Y.t
    Y.v = 0
  }
}

function applyOpenState(isOpen) {
  clearTimers()
  W.t = isOpen ? DRAWER_W : 0
  R.t = isOpen ? 0 : 1
  if (isOpen) {
    labelSprings.forEach((l, i) => {
      after(0.06 + i * 0.04, () => {
        if (props.open) {
          l.s.t = 1
          wake()
        }
      })
    })
  } else {
    labelSprings.forEach((l) => {
      l.s.t = 0
    })
  }
  wake()
}

watch(
  () => props.open,
  (val) => {
    nextTick(() => {
      if (labelSprings.length !== labelEls.value.filter(Boolean).length) {
        syncLabelSprings()
      }
      updateHighlight()
      applyOpenState(val)
    })
  },
)

watch(
  () => props.activeTab,
  () => nextTick(() => {
    updateHighlight()
    wake()
  }),
)

watch(
  [() => props.rmaThreads.length, () => props.patternThreads.length, () => props.isCs],
  () => nextTick(() => {
    syncLabelSprings()
    updateHighlight()
    wake()
  }),
)

let rafId = 0
let last = 0
let running = false

function isSettled(s, eps = 0.05) {
  return Math.abs(s.v) < eps && Math.abs(s.x - s.t) < eps
}

function wake() {
  if (running) return
  running = true
  last = performance.now()
  rafId = requestAnimationFrame(loop)
}

function loop(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30)
  last = now

  for (let i = timers.length - 1; i >= 0; i--) {
    if ((timers[i].t -= dt) <= 0) timers.splice(i, 1)[0].fn()
  }

  const sub = 4
  for (let k = 0; k < sub; k++) {
    step(W, dt / sub)
    step(R, dt / sub)
    step(Y, dt / sub)
    for (let j = 0; j < labelSprings.length; j++) {
      step(labelSprings[j].s, dt / sub)
    }
  }

  const progress = clamp(W.x / DRAWER_W, 0, 1)

  if (sideEl.value) {
    sideEl.value.style.width = `${Math.max(0, W.x).toFixed(2)}px`
    sideEl.value.style.opacity = clamp(progress * 1.4, 0, 1).toFixed(3)
    sideEl.value.style.pointerEvents = progress > 0.05 ? 'auto' : 'none'
  }
  if (backdropEl.value) {
    backdropEl.value.style.opacity = (progress * 0.62).toFixed(3)
    backdropEl.value.style.pointerEvents = progress > 0.05 ? 'auto' : 'none'
  }
  if (chevronEl.value) {
    chevronEl.value.style.transform = `rotate(${(180 * R.x).toFixed(2)}deg)`
  }
  if (logoEl.value) {
    logoEl.value.style.opacity = clamp(1 - R.x * 1.6, 0, 1).toFixed(3)
  }
  if (hlEl.value) {
    hlEl.value.style.transform = `translateY(${Y.x.toFixed(2)}px)`
  }
  for (let j = 0; j < labelSprings.length; j++) {
    const l = labelSprings[j]
    const o = clamp(l.s.x, 0, 1)
    l.el.style.opacity = o.toFixed(3)
    l.el.style.transform = `translateX(${((1 - o) * -10).toFixed(2)}px)`
  }

  const allDone =
    timers.length === 0 &&
    isSettled(W, 0.2) &&
    isSettled(R, 0.01) &&
    isSettled(Y, 0.2) &&
    labelSprings.every((l) => isSettled(l.s, 0.01))

  if (allDone) {
    running = false
    rafId = 0
    return
  }

  rafId = requestAnimationFrame(loop)
}

onMounted(() => {
  nextTick(() => {
    syncLabelSprings()
    updateHighlight(true)
    if (props.open) wake()
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  running = false
  clearTimers()
})

function setNavBtnRef(el, idx) {
  if (el) navBtnEls.value[idx] = el
}

function setLabelRef(el, idx) {
  if (el) labelEls.value[idx] = el
}

function pickTab(id) {
  emit('select-tab', id)
  emit('close')
}

function pickThread(item) {
  emit('select-thread', item)
  emit('close')
}
</script>

<template>
  <!-- 어두운 배경 스크림 -->
  <div
    ref="backdropEl"
    class="fixed inset-0 z-40 bg-[#020308]"
    style="opacity: 0; pointer-events: none"
    @click="emit('close')"
  />

  <!-- 좌측 스프링 사이드바 드로어 (DesignBookmark Sidebar Collapse) -->
  <aside
    ref="sideEl"
    class="fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden rounded-r-[24px] border-r border-white/12 bg-[#090c18]/[0.97] text-[#eef0f6] shadow-[0_24px_60px_rgba(0,0,0,0.72)]"
    style="width: 0px; opacity: 0; pointer-events: none"
    aria-label="모바일 탐색 메뉴"
  >
    <div class="flex h-full w-[286px] flex-col p-3 pt-[max(0.875rem,env(safe-area-inset-top))]">
      <!-- 상단 브랜드 + 접기 버튼 -->
      <div class="relative mb-2 flex h-11 shrink-0 items-center px-1.5">
        <div ref="logoEl" class="flex items-center gap-2.5">
          <span class="grid size-7 place-items-center rounded-[9px] bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-600 shadow-sm">
            <svg class="size-4 text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2.5 9c2.5 0 2.5 4.2 5 4.2S10 9 12 9s2.5 4.2 5 4.2S19.5 9 21.5 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <path d="M2.5 15c2.5 0 2.5 4.2 5 4.2S10 15 12 15s2.5 4.2 5 4.2S19.5 15 21.5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.6" />
            </svg>
          </span>
          <span
            :ref="(el) => setLabelRef(el, 0)"
            class="inline-block whitespace-nowrap text-[16px] font-medium tracking-[-0.01em] text-white will-change-transform"
          >
            E!ffect
          </span>
        </div>

        <button
          class="absolute right-0 top-1 grid size-9 place-items-center rounded-[12px] bg-white/[0.08] text-[#eef0f6] transition hover:bg-white/[0.15]"
          aria-label="사이드바 닫기"
          :aria-expanded="open"
          @click="emit('close')"
        >
          <span ref="chevronEl" class="inline-flex will-change-transform">
            <ChevronLeft class="size-[18px]" />
          </span>
        </button>
      </div>

      <!-- 주 메뉴 (스프링 슬라이딩 하이라이트 .hl 포함) -->
      <nav class="relative flex shrink-0 flex-col gap-0.5">
        <span
          ref="hlEl"
          class="pointer-events-none absolute inset-x-0 top-0 h-11 rounded-[14px] bg-white/[0.09] will-change-transform"
        />
        <button
          v-for="(item, idx) in navItems"
          :key="item.id"
          :ref="(el) => setNavBtnRef(el, idx)"
          class="relative z-10 flex h-11 items-center rounded-[14px] px-3 text-[14px] font-medium whitespace-nowrap transition-colors"
          :class="activeTab === item.id ? 'text-white' : 'text-[#b9becf] hover:text-white'"
          @click="pickTab(item.id)"
        >
          <component :is="item.icon" class="size-[19px] shrink-0" />
          <span
            :ref="(el) => setLabelRef(el, idx + 1)"
            class="ml-3 inline-block whitespace-nowrap will-change-transform"
          >
            {{ item.label }}
          </span>
        </button>
      </nav>

      <!-- 구분선 -->
      <div class="my-3 h-px shrink-0 bg-white/10" />

      <!-- 채팅 이력 (실제 대화가 있는 RMA / 불량 패턴만 표시) -->
      <div class="min-h-0 flex-1 overflow-y-auto pr-0.5 [scrollbar-width:none]">
        <template v-if="rmaThreads.length || (!isCs && patternThreads.length)">
          <!-- RMA 개별 채팅 -->
          <div v-if="rmaThreads.length" class="mb-4">
            <p class="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-[#b9becf]/65">
              RMA 채팅
            </p>
            <div class="flex flex-col gap-0.5">
              <button
                v-for="t in rmaThreads"
                :key="t.key"
                class="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left transition"
                :class="
                  activeTab === 'chat' && activeScopeKey === t.key
                    ? 'bg-white/[0.11] text-white'
                    : 'text-[#b9becf] hover:bg-white/[0.06] hover:text-white'
                "
                @click="pickThread(t)"
              >
                <MessageSquare class="size-4 shrink-0 text-cyan-300/80" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[13px] font-medium">{{ t.label }}</div>
                  <div v-if="t.preview" class="truncate text-[11px] text-[#b9becf]/65">{{ t.preview }}</div>
                </div>
              </button>
            </div>
          </div>

          <!-- 불량 패턴 개별 채팅 (품질 권한 전용) -->
          <div v-if="!isCs && patternThreads.length" class="mb-2">
            <p class="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-[#b9becf]/65">
              불량 패턴 채팅
            </p>
            <div class="flex flex-col gap-0.5">
              <button
                v-for="t in patternThreads"
                :key="t.key"
                class="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left transition"
                :class="
                  activeTab === 'chat' && activeScopeKey === t.key
                    ? 'bg-white/[0.11] text-white'
                    : 'text-[#b9becf] hover:bg-white/[0.06] hover:text-white'
                "
                @click="pickThread(t)"
              >
                <Folder class="size-4 shrink-0 text-violet-300/85" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[13px] font-medium">{{ t.label }}</div>
                  <div v-if="t.preview" class="truncate text-[11px] text-[#b9becf]/65">{{ t.preview }}</div>
                </div>
              </button>
            </div>
          </div>
        </template>

        <div v-else class="rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-4 text-center">
          <p class="text-[12px] leading-relaxed text-[#b9becf]/75">
            아직 대화한 이력이 없습니다.<br />
            RMA나 불량 패턴에 질문하면<br />
            여기에 자동으로 쌓입니다.
          </p>
        </div>
      </div>

      <!-- 하단 사용자 프로필 & 로그아웃 (ChatGPT 하단 바 스타일) -->
      <div class="mt-2 flex shrink-0 items-center justify-between border-t border-white/10 pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400/90 to-violet-500/90 text-[12px] font-semibold text-white">
            {{ initials }}
          </span>
          <div class="min-w-0 leading-tight">
            <div class="truncate text-[13.5px] font-medium text-white">{{ user?.name || '사용자' }}</div>
            <div class="truncate text-[11px] text-[#b9becf]/75">{{ user?.role_label || (isCs ? 'CS팀' : '품질관리팀') }}</div>
          </div>
        </div>
        <button
          class="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/[0.07] px-3 text-[11.5px] font-medium text-[#eef0f6] transition hover:bg-white/[0.14]"
          @click="emit('logout')"
        >
          <LogOut class="size-3.5" />로그아웃
        </button>
      </div>
    </div>
  </aside>
</template>
