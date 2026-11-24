<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import NotificationStack from './NotificationStack.vue'
import RollingNumber from './ui/RollingNumber.vue'
import Button from './ui/Button.vue'
import { api } from '@/lib/api'
import { prefersReducedMotion } from '@/lib/spring'
import { removeAlert, starAlert, toast } from '@/lib/state'

const router = useRouter()
const open = ref(false)
const items = ref([])
const unread = ref(0)
const root = ref(null)
const TOAST_TYPES = ['고위험', '재발 의심', '확산형']
let lastMaxId = null
let lastUnread = null
let timer

// ── 종: Kokonut UI "Bell Button"(MIT)의 진자 두 개를 그대로 옮겼다 ──────────────────────────
// 종과 추가 같은 축에 매달린 진자다. 서로 이어진 건 부딪힘뿐: 흔들리는 종의 테두리가 추를 쳐서 날리고,
// 추가 반대쪽을 때린다. 세게 때리면 그쪽으로 소리 물결이 번진다. 각도는 도, 시간은 초
const STEP = 1 / 240
const BELL_STIFFNESS = 380
const BELL_DAMPING = 5
const CLAPPER_STIFFNESS = 150
const CLAPPER_DAMPING = 4
const LIP = 13 // 추가 종 안에서 흔들릴 수 있는 범위
const RESTITUTION = 0.45
const RECOIL = 0.18 // 부딪힘이 훨씬 무거운 종에 전하는 몫
const STRIKE_SPEED = 260 // 이보다 세게 부딪히면 울린다
const RING_KICK = 600 // 새 알림
const NUDGE_KICK = 160 // 마우스가 스칠 때·열 때
const REST = 0.05
const PIVOT = { x: 12, y: 2.5 }
const bellG = ref(null)
const clapper = ref(null)
const waveL = ref(null)
const waveR = ref(null)
const sim = { bell: 0, bellSpeed: 0, clapper: 0, clapperSpeed: 0, raf: 0, last: 0, carry: 0, lastNudge: 0 }

function draw() {
  bellG.value?.setAttribute('transform', `rotate(${sim.bell.toFixed(2)} ${PIVOT.x} ${PIVOT.y})`)
  clapper.value?.setAttribute('transform', `rotate(${sim.clapper.toFixed(2)} ${PIVOT.x} ${PIVOT.y})`)
}
function flare(side, strength) {
  const wave = side > 0 ? waveR.value : waveL.value
  if (!wave?.animate) return
  const peak = Math.min(1, 0.45 + strength * 0.55)
  wave.animate(
    [
      { opacity: peak, transform: 'translateX(0px)' },
      { opacity: 0, transform: `translateX(${side * 3}px)` },
    ],
    { duration: 420, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
  )
}
function stepSim() {
  const s = sim
  s.bellSpeed += (-s.bell * BELL_STIFFNESS - s.bellSpeed * BELL_DAMPING) * STEP
  s.bell += s.bellSpeed * STEP
  s.clapperSpeed += (-s.clapper * CLAPPER_STIFFNESS - s.clapperSpeed * CLAPPER_DAMPING) * STEP
  s.clapper += s.clapperSpeed * STEP
  const relative = s.clapper - s.bell
  if (Math.abs(relative) <= LIP) return
  const side = relative > 0 ? 1 : -1
  const impact = (s.clapperSpeed - s.bellSpeed) * side
  s.clapper = s.bell + side * LIP
  if (impact <= 0) return
  s.clapperSpeed -= side * impact * (1 + RESTITUTION)
  s.bellSpeed += side * impact * RECOIL
  if (impact > STRIKE_SPEED) flare(side, impact / 1600)
}
function tick(now) {
  const s = sim
  s.raf = 0
  const elapsed = s.last ? Math.min((now - s.last) / 1000, 0.05) : STEP
  s.last = now
  s.carry += elapsed
  while (s.carry >= STEP) {
    stepSim()
    s.carry -= STEP
  }
  draw()
  const energy = Math.abs(s.bell) + Math.abs(s.bellSpeed) * 0.02 + Math.abs(s.clapper) + Math.abs(s.clapperSpeed) * 0.02
  if (energy < REST) {
    Object.assign(s, { bell: 0, bellSpeed: 0, clapper: 0, clapperSpeed: 0, last: 0 })
    draw()
    return
  }
  s.raf = requestAnimationFrame(tick)
}
function kick(speed) {
  if (prefersReducedMotion) return
  sim.bellSpeed += speed
  if (!sim.raf) sim.raf = requestAnimationFrame(tick)
}
function ring() {
  kick(sim.bellSpeed >= 0 ? RING_KICK : -RING_KICK)
  if (prefersReducedMotion) {
    flare(1, 0.6)
    flare(-1, 0.6)
  }
}
function nudge(e) {
  if (e.pointerType !== 'mouse' || e.timeStamp - sim.lastNudge < 700) return
  sim.lastNudge = e.timeStamp
  kick(sim.bellSpeed >= 0 ? NUDGE_KICK : -NUDGE_KICK)
}

// ── 알림 불러오기 ───────────────────────────────────────────────────────────
function shownIds() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem('rma.toasted') || '[]'))
  } catch {
    return new Set()
  }
}
function remember(ids) {
  try {
    sessionStorage.setItem('rma.toasted', JSON.stringify([...ids]))
  } catch {
    /* ignore */
  }
}

async function load() {
  const data = await api('/alerts', { query: { limit: 5 } })
  items.value = data.items
  // 미확인이 늘면(새 알림) 종이 울린다. 첫 불러오기는 울리지 않는다
  if (lastUnread != null && data.unread > lastUnread) ring()
  lastUnread = data.unread
  unread.value = data.unread
  // 신규 고위험·재발 의심·확산형 알림은 토스트 (세션당 1회)
  const shown = shownIds()
  const fresh = lastMaxId == null
    ? data.items.filter((a) => !a.read && Date.now() - new Date(a.created_at) < 86400000)
    : (await api('/alerts', { query: { after_id: lastMaxId } })).items
  for (const a of fresh.filter((a) => TOAST_TYPES.includes(a.type) && !shown.has(a.id)).reverse()) {
    shown.add(a.id)
    toast({
      title: `[${a.type}] ${a.target_label}`,
      description: a.reason,
      tone: a.type === '고위험' ? 'red' : 'purple',
      duration: 10000,
      action: { label: '지금 확인', onClick: () => markRead(a) },
    })
  }
  remember(shown)
  lastMaxId = data.max_id
}

async function markRead(a) {
  open.value = false
  try {
    await api(`/alerts/${a.id}/read`, { method: 'POST' })
  } catch {
    toast({ title: '대상을 찾을 수 없습니다', tone: 'red' })
    return
  }
  load()
  // RMA 대상 → 목록 행 펼침 / 패턴 대상(급증·반복 재발) → 알림·재발 관리
  if (TOAST_TYPES.includes(a.type)) router.push({ path: '/rmas', query: { open: a.rma_id } })
  else router.push({ path: '/quality/recurrence', query: { recurId: a.recur_id } })
}

async function readAll() {
  await api('/alerts/read-all', { method: 'POST' })
  load()
}

function toggle() {
  open.value = !open.value
  if (open.value) kick(NUDGE_KICK)
}

function outside(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false
}

onMounted(() => {
  load()
  timer = setInterval(load, 30000) // 실시간 연결 대신 30초 주기 갱신
  addEventListener('mousedown', outside)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  cancelAnimationFrame(sim.raf)
  removeEventListener('mousedown', outside)
})
</script>

<template>
  <div ref="root" class="relative">
    <Button variant="ghost" size="icon" :aria-label="unread ? `알림, 미확인 ${unread}건` : '알림'" :aria-expanded="open" @click="toggle" @pointerenter="nudge">
      <svg aria-hidden="true" class="size-[18px] overflow-visible" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24">
        <path ref="waveR" class="opacity-0" d="M21.5 4.5c1.2 1.6 1.8 3.4 1.8 5.5" />
        <path ref="waveL" class="opacity-0" d="M2.5 4.5C1.3 6.1.7 7.9.7 10" />
        <path ref="clapper" d="M10.27 21a2 2 0 0 0 3.46 0" />
        <g ref="bellG">
          <path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33" />
        </g>
      </svg>
      <span v-if="unread" class="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-sk-red px-1 text-[12px] font-bold leading-4 text-white">
        <template v-if="unread > 99">99+</template>
        <RollingNumber v-else :text="unread" :line-height="16" />
      </span>
    </Button>
    <Transition
      enter-from-class="opacity-0 -translate-y-1 scale-[0.98]"
      leave-to-class="opacity-0 -translate-y-1 scale-[0.98]"
      enter-active-class="transition-[opacity,translate,scale] duration-200 ease-[var(--ease-out)]"
      leave-active-class="transition-[opacity,translate,scale] duration-150 ease-[var(--ease-out)]"
    >
      <div v-if="open" class="absolute right-0 z-40 mt-2 w-[400px] origin-top-right rounded-2xl border bg-[#f7f8fa] shadow-lg">
        <div class="flex items-center justify-between px-4 pb-2 pt-3">
          <p class="text-sm font-semibold">알림 <span class="font-normal text-muted-foreground">미확인 {{ unread }}건</span></p>
          <Button variant="link" size="xs" @click="readAll">모두 읽음</Button>
        </div>
        <p v-if="!items.length" class="px-4 pb-8 pt-4 text-center text-sm text-muted-foreground">새로운 알림이 없습니다</p>
        <div v-else class="max-h-[460px] overflow-y-auto overflow-x-hidden px-3 pb-3">
          <NotificationStack :items="items" @open="markRead" @star="(x) => starAlert(api, x, load)" @remove="(x) => removeAlert(api, x, load)" />
        </div>
        <RouterLink to="/quality/recurrence" class="block rounded-b-2xl border-t bg-card px-4 py-2.5 text-center text-xs font-medium hover:bg-muted/60" @click="open = false">
          알림 센터 전체 보기
        </RouterLink>
      </div>
    </Transition>
  </div>
</template>
