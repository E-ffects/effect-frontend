<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { S, animate, clamp, settled, snap, step, stop } from '@/lib/spring'

// 에이전트 답변 말풍선. DesignBookmark "Streaming Reply"(streaming-reply/stream.js)의 움직임을 옮겼다:
// 답을 기다리는 동안은 작은 "답변 준비 중" 알약 → 답이 오면 말풍선이 넓어지고,
// 단어가 0.07초 간격으로 하나씩 올라오며 선명해진다(단어마다 스프링 340 26). 말풍선 높이는 글줄을 따라 늘어난다(260 26).
// - streaming=false(이전 대화를 다시 그릴 때)면 움직이지 않고 그대로 보여 준다
const props = defineProps({
  text: String,
  loading: Boolean,
  streaming: Boolean,
})
const emit = defineEmits(['grow', 'finished'])

const PAD_X = 12
const PAD_Y = 8
const WORD_GAP_S = 0.07

const box = ref()
const think = ref()
const body = ref()
const words = ref([]) // { text, s, on }
const mode = ref(props.loading ? 'think' : props.streaming ? 'stream' : 'still')

const W = S(0, 260, 26)
const Hh = S(36, 260, 26)
const T = S(1, 300, 30) // "답변 준비 중" 글자
let timers = []
let spans = []

const full = () => box.value?.parentElement?.clientWidth || 280

const comp = {
  frame(dt) {
    step(W, dt)
    step(Hh, dt)
    step(T, dt)
    for (const w of words.value) step(w.s, dt)
  },
  render() {
    if (!box.value) return
    box.value.style.width = `${W.x.toFixed(2)}px`
    box.value.style.height = `${Hh.x.toFixed(2)}px`
    if (think.value) think.value.style.opacity = clamp(T.x, 0, 1).toFixed(3)
    words.value.forEach((w, i) => {
      const el = spans[i]
      if (!el || !w.on) return
      const v = clamp(w.s.x, 0, 1.2)
      el.style.opacity = clamp(v, 0, 1).toFixed(3)
      el.style.transform = `translateY(${((1 - w.s.x) * 6).toFixed(2)}px)`
      el.style.filter = v < 0.98 ? `blur(${((1 - clamp(v, 0, 1)) * 4).toFixed(2)}px)` : 'none'
    })
  },
  idle: () => [W, Hh, T].every(settled) && words.value.every((w) => w.on && settled(w.s)),
}

function measureThink() {
  const w = think.value.offsetWidth + PAD_X * 2
  W.x = W.t = Math.min(w, full())
  Hh.x = Hh.t = think.value.offsetHeight + PAD_Y * 2
  comp.render()
}

async function startStream() {
  mode.value = 'stream'
  words.value = (props.text || '').split(' ').map((t) => ({ text: t, s: S(0, 340, 26), on: false }))
  await nextTick()
  spans = [...body.value.querySelectorAll('[data-w]')]
  body.value.style.width = `${full() - PAD_X * 2}px`
  T.t = 0
  W.t = full()
  animate(comp)
  words.value.forEach((w, i) =>
    timers.push(
      setTimeout(() => {
        w.on = true
        w.s.t = 1
        const el = spans[i]
        Hh.t = body.value.offsetTop + el.offsetTop + el.offsetHeight + PAD_Y
        animate(comp)
        emit('grow')
      }, i * WORD_GAP_S * 1000),
    ),
  )
  // 다 나온 뒤에는 고정 크기를 풀어 창 크기 변화에 따라가게 한다
  timers.push(
    setTimeout(() => {
      finish()
      emit('finished')
    }, words.value.length * WORD_GAP_S * 1000 + 700),
  )
}

function finish() {
  stop(comp)
  mode.value = 'still'
  if (!box.value) return
  box.value.style.width = ''
  box.value.style.height = ''
  if (body.value) body.value.style.width = ''
  ;[W, Hh, T].forEach(snap)
}

watch(
  () => props.loading,
  (now, was) => {
    if (was && !now) props.text ? startStream() : finish()
  },
)

onMounted(() => {
  if (mode.value === 'think') measureThink()
  else if (mode.value === 'stream') {
    measureThink()
    startStream()
  }
})
onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  stop(comp)
})
</script>

<template>
  <div
    ref="box"
    :class="mode === 'still' ? '' : 'overflow-hidden'"
    class="relative max-w-full rounded-lg rounded-tl-sm bg-muted text-sm leading-relaxed"
    :style="{ padding: `${PAD_Y}px ${PAD_X}px` }"
  >
    <span v-if="mode !== 'still'" ref="think" aria-hidden="true" class="absolute left-3 top-2 whitespace-nowrap text-[13px] font-medium text-[#6b717d]">
      <span v-for="(ch, k) in Array.from('답변 준비 중')" :key="k" class="ai-wave whitespace-pre" :style="{ animationDelay: `${k * 0.05}s` }">{{ ch }}</span>
    </span>
    <span v-if="mode === 'think'" class="sr-only" role="status">답변을 준비하고 있습니다</span>
    <p v-else-if="mode === 'stream'" ref="body" :aria-label="text">
      <template v-for="(w, i) in words" :key="i"><span data-w class="inline-block opacity-0" aria-hidden="true">{{ w.text }}</span>{{ i < words.length - 1 ? ' ' : '' }}</template>
    </p>
    <!-- 흐르는 동안은 단어 단위로 줄이 바뀌므로, 다 나온 뒤에도 단어를 쪼개지 않아야 줄이 다시 흐트러지지 않는다 -->
    <p v-else class="break-keep">{{ text }}</p>
  </div>
</template>
