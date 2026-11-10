<script setup>
// 1.5초 이상 호버 시 표시, 트리거·툴팁을 벗어나면 닫힘. 터치는 탭으로 토글 (화면설계서 0-2 툴팁 규칙)
// 키보드 포커스로도 열린다. 화면 최상위 레이어(Teleport)에 그려 표·카드 안에서 잘리지 않는다.
import { nextTick, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  delay: { type: Number, default: 1500 },
  width: { type: Number, default: 320 },
  dark: Boolean, // 어두운 툴팁 (KPI 계산식 등)
  placement: { type: String, default: 'bottom' }, // bottom | top (공간이 없으면 반대쪽)
  align: { type: String, default: 'center' }, // center | end (트리거 오른쪽 끝에 맞춤)
  block: Boolean, // 트리거를 블록으로 (카드 전체를 감쌀 때)
})
const open = ref(false)
const trigger = ref(null)
const pos = ref({ top: 0, left: 0 })
let openTimer = null
let closeTimer = null
const GAP = 8

function place() {
  const r = trigger.value.getBoundingClientRect()
  const want = props.align === 'end' ? r.right - props.width : r.left + r.width / 2 - props.width / 2
  pos.value = { top: r.bottom + GAP, left: Math.min(Math.max(8, want), innerWidth - props.width - 8) }
}

function show() {
  place()
  open.value = true
  nextTick(() => {
    const el = document.getElementById(tipId)
    if (!el) return
    const r = trigger.value.getBoundingClientRect()
    const above = r.top - el.offsetHeight - GAP
    const below = r.bottom + GAP
    const fitsAbove = above >= 8
    const fitsBelow = below + el.offsetHeight <= innerHeight - 8
    const top = props.placement === 'top' ? (fitsAbove || !fitsBelow ? above : below) : fitsBelow || !fitsAbove ? below : above
    pos.value = { ...pos.value, top: Math.max(8, top) }
  })
}

function enter() {
  clearTimeout(closeTimer)
  if (!open.value) openTimer = setTimeout(show, props.delay)
}

function leave() {
  clearTimeout(openTimer)
  closeTimer = setTimeout(() => (open.value = false), 120)
}

function toggle() {
  clearTimeout(openTimer)
  open.value ? (open.value = false) : show()
}

const tipId = 'tip-' + Math.random().toString(36).slice(2)
onBeforeUnmount(() => {
  clearTimeout(openTimer)
  clearTimeout(closeTimer)
})
</script>

<template>
  <span
    ref="trigger"
    :class="block ? 'block' : 'inline-flex'"
    :aria-describedby="open ? tipId : undefined"
    @mouseenter="enter"
    @mouseleave="leave"
    @focusin="enter"
    @focusout="leave"
    @keydown.esc="open = false"
    @click.stop="toggle"
  >
    <slot />
  </span>
  <Teleport to="body">
    <div
      v-if="open"
      :id="tipId"
      role="tooltip"
      :style="{ top: pos.top + 'px', left: pos.left + 'px', width: width + 'px' }"
      :class="dark ? 'rounded-xl bg-[#242a35] p-4 text-white shadow-[0_12px_32px_#14182040]' : 'rounded-lg border bg-card p-3 shadow-lg'"
      class="fixed z-50 text-xs"
      @mouseenter="enter"
      @mouseleave="leave"
      @click.stop
    >
      <slot name="content" />
    </div>
  </Teleport>
</template>
