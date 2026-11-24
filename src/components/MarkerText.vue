<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { HIGHLIGHT_SPEED, LINE_GAP, MASK_SPAN, MAX_MS, MIN_MS, PEN_EASE, PEN_SPEED, hash, strokesFor } from '@/lib/marker'
import { prefersReducedMotion as reduced } from '@/lib/spring'

// 손으로 긋는 표시. Kokonut UI "Marker Text"(MIT)를 Vue로 옮겼다.
// 안쪽에서 data-mark="highlight|underline|circle|box|strike" 가 붙은 요소를 읽는 순서대로 찾아,
// 글자가 화면에 60% 이상 보이는 순간 펜이 지나가듯 하나씩 그린다(형광펜은 글자 뒤, 나머지는 글자 위).
// - 표시 요소에 data-color 로 색을 바꿀 수 있다
// - show 를 주면 그 값대로 그리고 지운다. 안 주면 처음 보일 때 한 번 그린다
// - 글자 내용이 바뀌면(watchKey) 다시 재고 다시 그린다
const props = defineProps({
  as: { type: String, default: 'div' },
  show: { type: Boolean, default: undefined },
  gap: { type: Number, default: 140 }, // 표시 하나가 끝나고 다음이 시작하기까지(ms)
  watchKey: { type: [String, Number], default: '' },
})
const emit = defineEmits(['drawn'])

let uid = 0
const maskBase = `mk${Math.random().toString(36).slice(2, 7)}`
const root = ref(null)
const strokes = ref([])
const seen = ref(false)
const armed = ref(false) // true면 그리는 움직임이 켜진다. 지울 때는 바로
const visible = computed(() => props.show ?? seen.value)

function measure() {
  const el = root.value
  if (!el) return
  const origin = el.getBoundingClientRect()
  const next = []
  let clock = 0
  ;[...el.querySelectorAll('[data-mark]')].forEach((mark, index) => {
    const lines = [...mark.getClientRects()]
      .filter((r) => r.width > 1)
      // 스크롤되는 상자(고객 원문)면 스크롤만큼 더해 내용 기준 좌표로
      .map((r) => ({ left: r.left - origin.left + el.scrollLeft, top: r.top - origin.top + el.scrollTop, right: r.right - origin.left + el.scrollLeft, bottom: r.bottom - origin.top + el.scrollTop }))
    if (!lines.length) return
    const entry = { type: mark.dataset.mark || 'highlight', color: mark.dataset.color || undefined }
    const seed = hash(`${mark.textContent ?? ''}${index}`)
    const speed = entry.type === 'highlight' ? HIGHLIGHT_SPEED : PEN_SPEED
    const made = strokesFor(entry, lines, seed, index)
    made.forEach((s, i) => {
      const duration = Math.min(MAX_MS, Math.max(MIN_MS, s.length / speed))
      next.push({ ...s, id: `${maskBase}-${uid}-${s.key}`, delay: clock, duration })
      clock += duration + (i < made.length - 1 ? LINE_GAP : 0)
    })
    clock += props.gap
  })
  uid += 1
  strokes.value = next
}

const total = computed(() => strokes.value.reduce((end, s) => Math.max(end, s.delay + s.duration), 0))
const under = computed(() => strokes.value.filter((s) => s.under))
const over = computed(() => strokes.value.filter((s) => !s.under))

// 숨김 상태를 한 번 그린 다음 프레임에 그리기 시작해야, 다시 보여 줄 때도 움직임이 난다
let rafs = []
let drawnTimer = null
watch(
  visible,
  (v) => {
    rafs.forEach(cancelAnimationFrame)
    clearTimeout(drawnTimer)
    if (!v) {
      armed.value = false
      return
    }
    rafs = [requestAnimationFrame(() => rafs.push(requestAnimationFrame(() => (armed.value = true))))]
    drawnTimer = setTimeout(() => emit('drawn'), reduced ? 0 : total.value + 32)
  },
  { immediate: true },
)
// 글자가 바뀌면 지웠다가 다시 그린다
watch(
  () => props.watchKey,
  async () => {
    armed.value = false
    await nextTick()
    measure()
    if (visible.value) rafs = [requestAnimationFrame(() => rafs.push(requestAnimationFrame(() => (armed.value = true))))]
  },
)

let ro, io
onMounted(() => {
  measure()
  ro = new ResizeObserver(() => measure())
  ro.observe(root.value)
  document.fonts?.ready.then(measure)
  io = new IntersectionObserver(
    ([en]) => {
      if (en.isIntersecting) {
        seen.value = true
        io.disconnect()
      }
    },
    { threshold: 0.6 },
  )
  io.observe(root.value)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  io?.disconnect()
  rafs.forEach(cancelAnimationFrame)
  clearTimeout(drawnTimer)
})

const penStyle = (s) => ({ transition: armed.value && !reduced ? `stroke-dashoffset ${s.duration}ms ${PEN_EASE} ${s.delay}ms` : 'none' })
</script>

<template>
  <component :is="as" ref="root" class="relative isolate">
    <svg v-for="layer in [{ list: under, cls: '-z-10' }, { list: over, cls: 'z-10' }]" :key="layer.cls" aria-hidden="true" :class="layer.cls" class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
      <g v-for="s in layer.list" :key="s.id">
        <mask :id="s.id" maskUnits="userSpaceOnUse" :x="-MASK_SPAN / 2" :y="-MASK_SPAN / 2" :width="MASK_SPAN" :height="MASK_SPAN">
          <path
            :d="s.pen"
            fill="none"
            stroke="white"
            :stroke-dasharray="s.length + 1"
            :stroke-dashoffset="armed ? 0 : s.length + 1"
            :stroke-linecap="s.under ? 'butt' : 'round'"
            stroke-linejoin="round"
            :stroke-width="s.penWidth"
            :style="penStyle(s)"
          />
        </mask>
        <path :d="s.shape" :fill="s.color" :fill-opacity="s.alpha" :mask="`url(#${s.id})`" />
      </g>
    </svg>
    <slot />
  </component>
</template>
