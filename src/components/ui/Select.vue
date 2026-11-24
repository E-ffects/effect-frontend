<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { S, animate, clamp, settled, snap, step, stop, tune } from '@/lib/spring'

// 선택 상자. DesignBookmark "Spring Dropdown"(spring-dropdown/dropdown.js)의 스프링을 그대로 쓴다:
// - 목록 높이가 스프링(300 23)이라 살짝 넘치며 펼쳐지고, 줄이 0.045초 간격으로 떨어져 들어온다(300 24)
// - 마우스를 따라가는 강조 막대: 가는 쪽 끝은 단단하게(620 36), 반대쪽은 느슨하게(200 20) → 줄 사이에서 늘어난다
// - 고르면 체크가 그려지고(260 26), 새 값이 버튼 안으로 굴러 올라오며(340 26), 목록이 접힌다
// - 키보드: Enter·Space·↓ 열기, ↑↓ 이동, Enter 고르기, Esc·Tab 닫기
// 목록은 표 안처럼 잘리는 곳이 있어 body 위에 띄운다(fixed). 아래 공간이 모자라면 위로 연다
// 쓰는 법은 예전 <select>와 같다: v-model, options([{ value, label }] 또는 문자열), placeholder, size, id
const model = defineModel()
const props = defineProps({
  options: { type: Array, default: () => [] },
  placeholder: String,
  size: { type: String, default: 'default' },
  id: String,
})

const uid = useId()
const listId = `${uid}-list`
const ROW = computed(() => (props.size === 'sm' ? 32 : 36))
const PAD = 4
const MAX_H = 288

const opts = computed(() => [
  ...(props.placeholder !== undefined ? [{ value: '', label: props.placeholder, empty: true }] : []),
  ...props.options.map((o) => (typeof o === 'object' ? { value: o.value, label: o.label ?? String(o.value) } : { value: o, label: String(o) })),
])
const selIndex = computed(() => opts.value.findIndex((o) => String(o.value) === String(model.value ?? '')))
const current = computed(() => opts.value[selIndex.value] || (props.placeholder !== undefined ? opts.value[0] : null))

const trig = ref(null)
const menu = ref(null)
const scroller = ref(null)
const hl = ref(null)
const chev = ref(null)
const slotA = ref(null)
const slotB = ref(null)
const rows = []
const ticks = []

const open = ref(false)
const hov = ref(-1)
const place = ref({ left: 0, top: 0, width: 0, up: false })
// 버튼 안에서 굴러가는 두 칸(front가 지금 값)
const slotText = ref([current.value?.label ?? '', ''])
const slotEmpty = ref([!!current.value?.empty, false])
let front = 0

const H = S(0, 300, 23)
const C = S(0, 300, 18)
const O = S(0, 400, 34)
const TS = S(1, 500, 18)
const R = S(1, 340, 26)
const HT = S(PAD, 620, 36)
const HB = S(PAD + 36, 620, 36)
const HO = S(0, 400, 32)
let rowS = []
let tickS = []
let timers = []
const later = (s, fn) => timers.push(setTimeout(fn, s * 1000))

const contentH = () => PAD * 2 + ROW.value * opts.value.length
const menuH = () => Math.min(contentH(), MAX_H)

function ensureRowSprings() {
  const n = opts.value.length
  while (rowS.length < n) rowS.push(S(0, 300, 24))
  while (tickS.length < n) tickS.push(S(0, 260, 26))
  rowS.length = n
  tickS.length = n
  tickS.forEach((k, i) => (k.t = i === selIndex.value ? 1 : 0))
}

const comp = {
  frame(dt) {
    ;[H, C, O, TS, R, HT, HB, HO].forEach((s) => step(s, dt))
    rowS.forEach((s) => step(s, dt))
    tickS.forEach((s) => step(s, dt))
  },
  render() {
    if (trig.value) trig.value.style.transform = `scale(${TS.x.toFixed(4)})`
    if (chev.value) chev.value.style.transform = `translateY(-50%) rotate(${(180 * C.x).toFixed(2)}deg)`
    const a = front === 0 ? slotA.value : slotB.value
    const b = front === 0 ? slotB.value : slotA.value
    if (a && b) {
      const r = R.x
      a.style.opacity = clamp(r, 0, 1).toFixed(3)
      a.style.transform = `translateY(${((1 - r) * 14).toFixed(2)}px)`
      b.style.opacity = clamp(1 - r, 0, 1).toFixed(3)
      b.style.transform = `translateY(${(-r * 14).toFixed(2)}px)`
    }
    const m = menu.value
    if (!m) return
    const mh = menuH()
    const h = Math.max(0, H.x)
    const o = clamp(O.x, 0, 1)
    m.style.height = `${h.toFixed(2)}px`
    m.style.opacity = o.toFixed(3)
    m.style.visibility = h < 1 ? 'hidden' : 'visible'
    m.style.transform = `scaleX(${(0.9 + 0.1 * clamp(H.x / mh, 0, 1.06)).toFixed(4)})`
    rowS.forEach((s, i) => {
      const el = rows[i]
      if (!el) return
      el.style.opacity = clamp(s.x, 0, 1).toFixed(3)
      el.style.transform = `translateY(${((s.x - 1) * 14).toFixed(2)}px)`
      if (ticks[i]) ticks[i].style.strokeDashoffset = (22 * (1 - clamp(tickS[i].x, 0, 1))).toFixed(2)
    })
    if (hl.value) {
      const ch = contentH()
      hl.value.style.opacity = (clamp(HO.x, 0, 1) * o).toFixed(3)
      const ht = clamp(Math.min(HT.x, HB.x - 16), PAD, ch - PAD - 16)
      const hb = clamp(HB.x, ht + 16, ch - PAD)
      hl.value.style.height = `${(hb - ht).toFixed(2)}px`
      hl.value.style.transform = `translateY(${ht.toFixed(2)}px)`
    }
  },
  idle: () => !open.value && [H, C, O, TS, R, HO].every(settled) && rowS.every(settled) && tickS.every(settled),
}

function position() {
  const r = trig.value?.getBoundingClientRect()
  if (!r) return
  const mh = menuH()
  const below = innerHeight - r.bottom - 8
  const up = below < mh + 6 && r.top > below
  place.value = { left: r.left, top: up ? r.top - 6 - mh : r.bottom + 6, width: r.width, up }
}

function hover(i, jump) {
  if (i === hov.value || i < 0 || i >= opts.value.length) return
  const top = PAD + i * ROW.value
  if (jump || hov.value < 0) {
    HT.t = top
    HB.t = top + ROW.value
    snap(HT)
    snap(HB)
  } else {
    const down = i > hov.value
    tune(down ? HB : HT, 620, 36)
    tune(down ? HT : HB, 200, 20)
    HT.t = top
    HB.t = top + ROW.value
  }
  hov.value = i
  HO.t = 1
  // 긴 목록: 강조된 줄이 보이게 스크롤
  const sc = scroller.value
  if (sc) {
    if (top < sc.scrollTop) sc.scrollTop = top - PAD
    else if (top + ROW.value > sc.scrollTop + sc.clientHeight) sc.scrollTop = top + ROW.value - sc.clientHeight + PAD
  }
  animate(comp)
}

function setOpen(o) {
  if (open.value === o) return
  open.value = o
  timers.forEach(clearTimeout)
  timers = []
  ensureRowSprings()
  if (o) position()
  H.t = o ? menuH() : 0
  C.t = o ? 1 : 0
  O.t = o ? 1 : 0
  const n = opts.value.length
  rowS.forEach((s, i) => later(o ? 0.05 + Math.min(i, 8) * 0.045 : Math.max(0, Math.min(n - 1 - i, 8)) * 0.02, () => ((s.t = open.value ? 1 : 0), animate(comp))))
  if (o) {
    nextTick(() => hover(Math.max(0, selIndex.value), true))
  } else {
    hov.value = -1
    HO.t = 0
  }
  animate(comp)
}

function select(i) {
  const o = opts.value[i]
  if (!o) return
  if (i !== selIndex.value) {
    front ^= 1
    slotText.value[front] = o.label
    slotEmpty.value[front] = !!o.empty
    R.x = 0
    R.v = 0
    R.t = 1
    model.value = o.value
  }
  tickS.forEach((k, j) => (k.t = j === i ? 1 : 0))
  TS.x = 0.955
  animate(comp)
  later(0.24, () => setOpen(false))
}

function onTrigger() {
  TS.x = 0.965
  setOpen(!open.value)
}
function onKey(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) setOpen(true)
    else hover(hov.value + (e.key === 'ArrowDown' ? 1 : -1))
  } else if ((e.key === 'Enter' || e.key === ' ') && open.value && hov.value > -1) {
    e.preventDefault()
    select(hov.value)
  } else if (e.key === 'Escape' && open.value) {
    e.preventDefault()
    setOpen(false)
  } else if (e.key === 'Tab' && open.value) setOpen(false)
}

// 바깥을 누르면 닫는다. 스크롤·창 크기가 바뀌면 자리를 다시 잡는다
const onDocDown = (e) => {
  if (!open.value) return
  const path = e.composedPath()
  if (!path.includes(trig.value) && !path.includes(menu.value)) setOpen(false)
}
const onMove = (e) => {
  if (open.value && !menu.value?.contains(e.target)) position()
}

// 바깥에서 값이 바뀌면(초기화 등) 버튼 글자를 바로 맞춘다
watch(current, (c) => {
  if (!c || slotText.value[front] === c.label) return
  slotText.value[front] = c.label
  slotEmpty.value[front] = !!c.empty
})
watch(opts, () => ensureRowSprings())

onMounted(() => {
  ensureRowSprings()
  addEventListener('pointerdown', onDocDown, true)
  addEventListener('scroll', onMove, true)
  addEventListener('resize', onMove)
  comp.render()
})
onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  stop(comp)
  removeEventListener('pointerdown', onDocDown, true)
  removeEventListener('scroll', onMove, true)
  removeEventListener('resize', onMove)
})
</script>

<template>
  <div class="relative inline-flex">
    <button
      :id="id"
      ref="trig"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="open && hov > -1 ? `${listId}-${hov}` : undefined"
      :class="size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm'"
      class="relative w-full rounded-md border bg-card pl-3 pr-8 text-left shadow-xs will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      @click="onTrigger"
      @keydown="onKey"
    >
      <!-- 폭 맞춤용(보이지 않음): 예전 <select>처럼 가장 긴 항목 폭만큼 넓어진다 (폭을 따로 주지 않은 곳) -->
      <span aria-hidden="true" class="invisible block h-0 overflow-hidden">
        <span v-for="o in opts" :key="`w${o.value}`" class="block h-0 whitespace-nowrap">{{ o.label }}</span>
      </span>
      <span class="absolute inset-y-0 left-3 right-8 block overflow-hidden">
        <span
          v-for="(t, k) in slotText"
          :key="k"
          :ref="(el) => (k === 0 ? (slotA = el) : (slotB = el))"
          :class="slotEmpty[k] ? 'text-muted-foreground' : ''"
          :style="k === front ? null : { opacity: 0 }"
          :aria-hidden="k !== front"
          class="absolute inset-0 flex items-center truncate whitespace-nowrap will-change-transform"
        >{{ t }}</span>
      </span>
      <ChevronDown ref="chev" class="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground will-change-transform" />
    </button>

    <Teleport to="body">
      <div
        :id="listId"
        ref="menu"
        role="listbox"
        :aria-labelledby="id"
        :style="{ left: `${place.left}px`, top: `${place.top}px`, minWidth: `${place.width}px`, transformOrigin: place.up ? '50% 100%' : '50% 0', height: 0, opacity: 0, visibility: 'hidden' }"
        :class="open ? 'pointer-events-auto' : 'pointer-events-none'"
        class="fixed z-[60] max-w-[320px] overflow-hidden rounded-xl border bg-card shadow-[0_8px_24px_rgb(16_24_40/0.12)] will-change-transform"
      >
        <div ref="scroller" class="relative max-h-[288px] overflow-y-auto" :style="{ padding: `${PAD}px` }" @pointerleave="HO.t = 0; animate(comp)">
          <i ref="hl" aria-hidden="true" class="pointer-events-none absolute inset-x-1 top-0 rounded-lg bg-[#f0f2f5] opacity-0 will-change-transform" />
          <div
            v-for="(o, i) in opts"
            :id="`${listId}-${i}`"
            :key="`${o.value}`"
            :ref="(el) => (rows[i] = el)"
            role="option"
            :aria-selected="i === selIndex"
            :style="{ height: `${ROW}px`, opacity: 0 }"
            :class="[size === 'sm' ? 'text-xs' : 'text-sm', o.empty ? 'text-muted-foreground' : 'text-foreground']"
            class="relative z-[1] flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg pl-2.5 pr-2 will-change-transform"
            @pointerenter="hover(i)"
            @pointermove="hover(i)"
            @click="select(i)"
          >
            <span class="min-w-0 flex-1 truncate" :class="i === selIndex ? 'font-semibold' : ''">{{ o.label }}</span>
            <svg viewBox="0 0 24 24" class="size-4 shrink-0 text-primary" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path :ref="(el) => (ticks[i] = el)" d="M5 12.5l4.5 4.5L19 7.5" style="stroke-dasharray: 22; stroke-dashoffset: 22" />
            </svg>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
