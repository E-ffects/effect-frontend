<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Upload } from 'lucide-vue-next'
import { S, animate, clamp, settled, step, stop } from '@/lib/spring'

// 파일 놓는 곳. DesignBookmark "File Drop"(file-drop/drop.js)의 스프링 값을 그대로 쓴다:
// - 파일을 끌고 오면 영역 바탕이 떠오르고(300 26) 살짝 커지며, 화살표가 위아래로 까딱인다
// - 놓으면 동그라미가 꿀꺽 삼키듯 커졌다 돌아오고(420 14), 둘레 고리가 퍼센트와 함께 찬다
//   (처음엔 빠르게, 중간에 잠깐 느려졌다가 끝까지 — 원본과 같은 2.1초)
// - 100이 되면 동그라미가 초록으로 차고(260 21) 체크가 그려지며(200 26), 두 줄 글이 굴러 바뀐다(360 30)
// 실제 업로드는 접수할 때 한다. 여기서는 파일을 붙이는 모습만 보여 주므로 문구도 "첨부"로 쓴다
// 원본의 "파일 칩이 혼자 날아드는 데모"는 실제 폼에선 넣지 않았다
// - check(file): 붙여도 되는지 부모가 확인(확장자·크기). false면 움직이지 않는다
// - finished: 완료 모습을 잠깐 보여 준 뒤 발생 → 부모가 미리보기로 바꾼다
const props = defineProps({
  accept: String,
  check: { type: Function, default: () => true },
  error: Boolean,
  title: { type: String, default: '파일을 끌어다 놓거나 눌러서 고르세요' },
  hint: String,
})
const emit = defineEmits(['finished'])

const CIRC = 2 * Math.PI * 33
const DUR = 2.1
const SHOW_DONE_S = 1.3

const zone = ref(null)
const core = ref(null)
const g = ref(null)
const ring = ref(null)
const arc = ref(null)
const up = ref(null)
const pct = ref(null)
const ok = ref(null)
const tick = ref(null)
const pick = ref(null)
const lineT = ref(null)
const lineS = ref(null)

const ZS = S(1, 380, 16) // 영역 크기
const ZH = S(0, 300, 26) // 파일이 가까이 왔을 때 떠오름
const CS = S(1, 420, 14) // 동그라미 꿀꺽
const UP = S(1, 420, 30) // 화살표
const PO = S(0, 420, 30) // 퍼센트
const RO = S(0, 300, 30) // 고리
const G = S(0, 260, 21) // 초록
const K = S(0, 200, 26) // 체크
const all = [ZS, ZH, CS, UP, PO, RO, G, K]

let phase = 'idle'
let p = 0
let tUp = 0
let total = 0
let name = ''
let clock = 0
let overAt = -9
let timers = []
const lines = {}

// 크기 표기는 접수 화면 미리보기와 같은 단위(1024)로
const fmt = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`)
const short = (n) => (n.length > 22 ? `${n.slice(0, 11)}…${n.slice(-9)}` : n)
// 빠르게 출발, 중간에 잠깐 느려졌다가, 끝까지 달린다
const pace = (x) => (x < 0.35 ? x * 1.4 : x < 0.6 ? 0.49 + (x - 0.35) * 0.4 : 0.59 + (x - 0.6) * 1.025)

// 두 줄 글: 옛 줄은 위로 빠지고 새 줄이 아래에서 올라온다
function makeLine(el) {
  return { el, cur: el.firstElementChild, old: null, o: S(1, 360, 30) }
}
function say(l, text) {
  if (l.cur.textContent === text) return
  if (l.old) l.old.remove()
  l.old = l.cur
  l.cur = document.createElement('span')
  l.cur.className = l.old.className
  l.cur.textContent = text
  l.el.appendChild(l.cur)
  l.o.x = 0
  l.o.v = 0
  l.o.t = 1
  animate(comp)
}

function begin(file) {
  name = short(file.name)
  total = file.size
  phase = 'upload'
  p = 0
  tUp = 0
  UP.t = 0
  PO.t = 1
  RO.t = 1
  G.t = 0
  K.t = 0
  CS.x = 1.2
  ZS.x = 0.965
  say(lines.t, `${name} 첨부 중`)
  say(lines.s, `0KB / ${fmt(total)}`)
  animate(comp)
}
function done() {
  phase = 'done'
  p = 1
  PO.t = 0
  RO.t = 0
  G.t = 1
  K.t = 1
  CS.x = 0.84
  say(lines.t, '원문 파일 첨부 완료')
  say(lines.s, `${name} · ${fmt(total)} · 접수하면 함께 올라갑니다`)
  timers.push(setTimeout(() => emit('finished'), SHOW_DONE_S * 1000))
}

async function take(file) {
  if (!file || phase === 'upload') return
  if ((await props.check(file)) === false) return
  begin(file)
}

const comp = {
  frame(dt) {
    clock += dt
    if (phase === 'upload') {
      tUp += dt
      p = clamp(pace(tUp / DUR), 0, 1)
      if (tUp >= DUR) done()
    }
    ZH.t = phase === 'idle' && clock - overAt < 0.2 ? 1 : 0
    all.forEach((s) => step(s, dt))
    step(lines.t.o, dt)
    step(lines.s.o, dt)
  },
  render() {
    if (!zone.value) return
    const h = clamp(ZH.x, 0, 1)
    zone.value.style.setProperty('--h', h.toFixed(3))
    zone.value.style.transform = `scale(${(ZS.x * (1 + 0.012 * ZH.x)).toFixed(4)})`
    core.value.style.transform = `translateY(${(-5 * ZH.x).toFixed(2)}px) scale(${CS.x.toFixed(4)})`
    const bob = -3.5 * h * (0.5 + 0.5 * Math.sin(clock * 7))
    up.value.style.opacity = clamp(UP.x, 0, 1).toFixed(3)
    up.value.style.transform = `translateY(${(bob + (1 - UP.x) * -12).toFixed(2)}px) scale(${(0.6 + 0.4 * UP.x).toFixed(3)})`
    pct.value.style.opacity = clamp(PO.x, 0, 1).toFixed(3)
    pct.value.style.transform = `scale(${(0.7 + 0.3 * PO.x).toFixed(3)})`
    ring.value.style.opacity = clamp(RO.x, 0, 1).toFixed(3)
    arc.value.style.strokeDashoffset = (CIRC * (1 - p)).toFixed(2)
    g.value.style.transform = `scale(${Math.max(0, G.x).toFixed(4)})`
    ok.value.style.opacity = clamp(K.x * 4, 0, 1).toFixed(3)
    tick.value.style.strokeDashoffset = (24 * (1 - clamp(K.x, 0, 1))).toFixed(2)
    if (phase === 'upload') {
      const n = String(Math.round(p * 100))
      if (pct.value.textContent !== n) pct.value.textContent = n
      const s = `${fmt(p * total)} / ${fmt(total)}`
      if (lines.s.cur.textContent !== s) lines.s.cur.textContent = s
    }
    ;[lines.t, lines.s].forEach((l) => {
      const o = clamp(l.o.x, 0, 1)
      l.cur.style.opacity = clamp((o - 0.35) / 0.65, 0, 1).toFixed(3) // 새 줄은 옛 줄이 빠진 뒤에
      l.cur.style.transform = `translateY(${((1 - l.o.x) * 16).toFixed(2)}px)`
      if (l.old) {
        if (o > 0.985) {
          l.old.remove()
          l.old = null
        } else {
          l.old.style.opacity = clamp(1 - o * 1.8, 0, 1).toFixed(3)
          l.old.style.transform = `translateY(${(-l.o.x * 16).toFixed(2)}px)`
        }
      }
    })
  },
  idle: () => phase !== 'upload' && clock - overAt > 0.3 && all.every(settled) && settled(lines.t.o) && settled(lines.s.o),
}

function onOver() {
  overAt = clock
  animate(comp)
}
function onDrop(e) {
  overAt = -9
  take(e.dataTransfer?.files?.[0])
}
function onPick() {
  take(pick.value.files?.[0])
  pick.value.value = ''
}
function choose() {
  if (phase !== 'upload') pick.value.click()
}

onMounted(() => {
  lines.t = makeLine(lineT.value)
  lines.s = makeLine(lineS.value)
  arc.value.style.strokeDasharray = CIRC.toFixed(2)
  comp.render()
})
onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  stop(comp)
})
</script>

<template>
  <div
    ref="zone"
    role="button"
    tabindex="0"
    :aria-label="`${title}. 끌어다 놓거나 Enter로 파일을 고릅니다`"
    :class="error ? 'border-destructive' : 'border-[#e6e8ec] hover:border-[#cfd3da]'"
    class="relative h-[208px] cursor-pointer overflow-hidden rounded-xl border bg-card transition-colors will-change-transform after:pointer-events-none after:absolute after:inset-0 after:bg-[#f0f2f5] after:opacity-[var(--h,0)] after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/50"
    @click="choose"
    @keydown.enter.prevent="choose"
    @keydown.space.prevent="choose"
    @pointerdown="ZS.x = 0.975; animate(comp)"
    @dragover.prevent="onOver"
    @dragenter.prevent="onOver"
    @drop.prevent="onDrop"
  >
    <div ref="core" class="absolute left-1/2 top-8 z-[1] -ml-9 size-[72px] rounded-full bg-[#f0f2f5] will-change-transform">
      <i ref="g" class="absolute inset-0 scale-0 rounded-full bg-[#1f9d6b] will-change-transform" />
      <svg ref="ring" viewBox="0 0 72 72" fill="none" stroke-width="3" stroke-linecap="round" class="absolute inset-0 size-full -rotate-90 opacity-0">
        <circle cx="36" cy="36" r="33" stroke="#e1e4e9" />
        <circle ref="arc" cx="36" cy="36" r="33" stroke="#111" style="stroke-dashoffset: 207.35" />
      </svg>
      <span ref="up" class="absolute inset-0 grid place-items-center text-[#4a505c] will-change-transform"><Upload class="size-[26px]" aria-hidden="true" /></span>
      <span ref="pct" class="absolute inset-0 grid place-items-center text-[19px] font-bold tracking-[-0.02em] text-[#111] opacity-0 tabular">0</span>
      <span ref="ok" class="absolute inset-0 grid place-items-center text-white opacity-0">
        <svg viewBox="0 0 24 24" class="size-[30px]" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path ref="tick" d="M5 12.5l4.5 4.5L19 7.5" style="stroke-dasharray: 24; stroke-dashoffset: 24" />
        </svg>
      </span>
    </div>
    <div ref="lineT" class="pointer-events-none absolute inset-x-4 top-[124px] z-[1] h-6 overflow-hidden text-center" aria-live="polite">
      <span class="absolute inset-x-0 top-0 truncate text-[15px] font-bold leading-6 tracking-[-0.015em] will-change-transform">{{ title }}</span>
    </div>
    <div ref="lineS" class="pointer-events-none absolute inset-x-4 top-[152px] z-[1] h-5 overflow-hidden text-center">
      <span class="absolute inset-x-0 top-0 truncate text-[13px] leading-5 text-muted-foreground tabular will-change-transform">{{ hint }}</span>
    </div>
    <input ref="pick" type="file" :accept="accept" class="hidden" tabindex="-1" aria-hidden="true" @change="onPick" />
  </div>
</template>
