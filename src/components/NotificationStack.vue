<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AlertItem from './AlertItem.vue'
import { prefersReducedMotion as reduced } from '@/lib/spring'

// 알림 카드 더미. Kokonut UI "Notification Stack"(MIT)을 Vue로 옮겼다.
// - 접힌 상태: 맨 앞 카드 + 뒤 카드 2장의 가장자리가 아래로 살짝 보인다(10px씩, 5%씩 작게)
// - 마우스를 올리거나 키보드로 들어오거나 "모두 보기"를 누르면 카드가 아래로 펼쳐진다(0.3초)
// - 옆으로 밀면 지운다: 100px 넘게 밀거나 빠르게 튕기면(0.11px/ms) 그 속도 그대로 날아가고, 아니면 스프링으로 돌아온다
//   (휴지통 버튼도 같은 비행). 날아간 뒤 remove 이벤트 → 화면이 실제 삭제 요청
// - 새 알림은 맨 위에서 내려오며 들어온다
const props = defineProps({ items: { type: Array, default: () => [] } })
const emit = defineEmits(['open', 'star', 'remove'])

const PEEK = 10
const VISIBLE_BEHIND = 2
const GAP = 8
const FALLBACK_HEIGHT = 96
const DISMISS_DISTANCE = 100
const DISMISS_VELOCITY = 0.11
const AXIS_LOCK = 6
const SPRING_STIFFNESS = 520
const SPRING_DAMPING = 2 * Math.sqrt(SPRING_STIFFNESS) // 임계 감쇠: 넘치지 않고 돌아온다
const FLIGHT_MIN_SPEED = 1400
const FLIGHT_ACCEL = 4200
const VELOCITY_WINDOW_MS = 80
const EXIT_MS = 200

const heights = ref({})
const hovered = ref(false)
const focused = ref(false)
const pinned = ref(false)
const leaving = ref(new Set())
const fresh = ref(new Set())
const known = new Set()
let firstLoad = true

const swipeNodes = new Map()
const swipeX = new Map()
const frames = new Map()
const lastY = new Map()
const dismissed = new Set()
let drag = null
let suppressClick = false

// 새로 들어온 알림: 첫 프레임은 위에 숨겨 두었다가 다음 프레임에 제자리로
watch(
  () => props.items.map((a) => a.id),
  (ids) => {
    const added = ids.filter((id) => !known.has(id))
    ids.forEach((id) => known.add(id))
    if (firstLoad) {
      firstLoad = false
      return
    }
    if (!added.length || reduced) return
    fresh.value = new Set([...fresh.value, ...added])
    nextTick(() => requestAnimationFrame(() => requestAnimationFrame(() => (fresh.value = new Set()))))
  },
  { immediate: true },
)

const laidOut = computed(() => props.items.filter((a) => !leaving.value.has(a.id)))
const expanded = computed(() => (hovered.value || focused.value || pinned.value) && laidOut.value.length > 1)
const heightOf = (id) => heights.value[id] ?? FALLBACK_HEIGHT
const frontHeight = computed(() => (laidOut.value[0] ? heightOf(laidOut.value[0].id) : 0))
const stackHeight = computed(() =>
  expanded.value
    ? laidOut.value.reduce((s, a) => s + heightOf(a.id), 0) + Math.max(laidOut.value.length - 1, 0) * GAP
    : frontHeight.value + Math.min(laidOut.value.length - 1, VISIBLE_BEHIND) * PEEK,
)
const offsets = computed(() => {
  const out = []
  let run = 0
  for (const a of laidOut.value) {
    out.push(run)
    run += heightOf(a.id) + GAP
  }
  return out
})

function layout(a) {
  const index = laidOut.value.findIndex((x) => x.id === a.id)
  const isLeaving = index === -1
  const depth = Math.max(index, 0)
  const hiddenBehind = !(expanded.value || depth <= VISIBLE_BEHIND)
  const scale = expanded.value || isLeaving ? 1 : 1 - depth * 0.05
  // 뒤 카드는 아래쪽을 맞춰, 높이가 달라도 맨 앞 카드 아래로 가장자리가 보이게
  const restingY = expanded.value ? offsets.value[depth] : frontHeight.value + depth * PEEK - heightOf(a.id) * scale
  let y = isLeaving ? (lastY.get(a.id) ?? 0) : restingY
  if (!isLeaving) lastY.set(a.id, restingY)
  const isFresh = fresh.value.has(a.id)
  if (isFresh) y -= 28
  return {
    depth,
    hiddenBehind,
    muted: !expanded.value && depth > 0,
    style: {
      transform: `translateY(${y}px) scale(${scale})`,
      opacity: hiddenBehind || isFresh ? 0 : 1,
      zIndex: props.items.length - depth,
      pointerEvents: hiddenBehind ? 'none' : undefined,
      transition: isFresh ? 'none' : undefined,
    },
  }
}

// 카드 높이: 처음 붙을 때와 크기가 바뀔 때만 잰다
const ro = new ResizeObserver((entries) => {
  const next = { ...heights.value }
  let changed = false
  for (const e of entries) {
    const id = Number(e.target.dataset.id)
    const h = Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.target.offsetHeight)
    if (h && next[id] !== h) {
      next[id] = h
      changed = true
    }
  }
  if (changed) heights.value = next
})
const liRef = (el) => el && ro.observe(el)

const opacityFor = (x) => Math.max(1 - Math.abs(x) / 240, 0.3)
function paint(id, x) {
  swipeX.set(id, x)
  const node = swipeNodes.get(id)
  if (!node) return
  node.style.transition = 'none'
  node.style.transform = x === 0 ? '' : `translateX(${x}px)`
  node.style.opacity = x === 0 ? '' : `${opacityFor(x)}`
}
function stopFrame(id) {
  const f = frames.get(id)
  if (f !== undefined) cancelAnimationFrame(f)
  frames.delete(id)
}
function run(id, stepFn, onDone) {
  stopFrame(id)
  let last = performance.now()
  const tick = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    if (stepFn(dt)) {
      frames.delete(id)
      onDone?.()
      return
    }
    frames.set(id, requestAnimationFrame(tick))
  }
  frames.set(id, requestAnimationFrame(tick))
}
function snapBack(id, velocity) {
  let x = swipeX.get(id) ?? 0
  let v = velocity * 1000
  if (reduced) return paint(id, 0)
  run(id, (dt) => {
    v += (-SPRING_STIFFNESS * x - SPRING_DAMPING * v) * dt
    x += v * dt
    if (Math.abs(x) < 0.5 && Math.abs(v) < 10) {
      paint(id, 0)
      return true
    }
    paint(id, x)
    return false
  })
}
function finishDismiss(a) {
  swipeX.delete(a.id)
  lastY.delete(a.id)
  emit('remove', a)
}
/** 카드를 옆으로 날려 보낸다. 밀어서 놓은 속도를 그대로 이어받고, 버튼으로 지우면 최소 속도로 출발 */
function dismiss(a, direction, velocity = 0) {
  if (dismissed.has(a.id)) return
  dismissed.add(a.id)
  leaving.value = new Set(leaving.value).add(a.id)
  const node = swipeNodes.get(a.id)
  if (!node || reduced) {
    stopFrame(a.id)
    if (node) {
      node.style.transition = `opacity ${EXIT_MS}ms var(--ease-out)`
      node.style.opacity = '0'
    }
    setTimeout(() => finishDismiss(a), EXIT_MS)
    return
  }
  const distance = node.offsetWidth * 1.1
  let x = swipeX.get(a.id) ?? 0
  let speed = Math.max(Math.abs(velocity) * 1000, FLIGHT_MIN_SPEED)
  run(
    a.id,
    (dt) => {
      speed += FLIGHT_ACCEL * dt
      x += direction * speed * dt
      const done = Math.abs(x) >= distance
      paint(a.id, done ? direction * distance : x)
      node.style.opacity = `${Math.max(1 - Math.abs(x) / distance, 0)}`
      return done
    },
    () => finishDismiss(a),
  )
}

function releaseVelocity(samples) {
  const last = samples.at(-1)
  if (!last) return 0
  let first = last
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > VELOCITY_WINDOW_MS) break
    first = samples[i]
  }
  const dt = last.t - first.t
  return dt > 0 ? (last.x - first.x) / dt : 0
}
function dismissDirection(dx, velocity) {
  const flick = Math.abs(velocity) > DISMISS_VELOCITY && Math.sign(velocity) === Math.sign(dx)
  if (Math.abs(dx) < DISMISS_DISTANCE && !flick) return 0
  return (dx === 0 ? velocity : dx) > 0 ? 1 : -1
}

function onDown(e, depth, a) {
  if (drag || leaving.value.has(a.id) || (!expanded.value && depth > 0)) return
  suppressClick = false
  if (e.pointerType === 'mouse' && e.button !== 0) return
  if (e.target.closest('button[aria-label]')) return // 즐겨찾기·삭제 버튼
  stopFrame(a.id)
  drag = { id: a.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: swipeX.get(a.id) ?? 0, dx: 0, axis: null, samples: [] }
}
function onMove(e, a) {
  const d = drag
  if (!d || d.pointerId !== e.pointerId || d.id !== a.id) return
  const dx = e.clientX - d.startX
  const dy = e.clientY - d.startY
  if (d.axis === null) {
    if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return
    d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (d.axis === 'x') e.currentTarget.setPointerCapture(e.pointerId)
  }
  if (d.axis !== 'x') return
  d.dx = d.originX + dx
  d.samples.push({ t: e.timeStamp, x: d.dx })
  if (d.samples.length > 12) d.samples.shift()
  paint(a.id, d.dx)
}
function onUp(e, a) {
  const d = drag
  if (!d || d.pointerId !== e.pointerId || d.id !== a.id) return
  drag = null
  if (d.axis !== 'x') {
    if (swipeX.get(a.id)) snapBack(a.id, 0)
    return
  }
  suppressClick = true
  const velocity = releaseVelocity(d.samples)
  const direction = dismissDirection(d.dx, velocity)
  if (direction === 0) return snapBack(a.id, velocity)
  dismiss(a, direction, Math.sign(velocity) === direction ? velocity : 0)
}
function onCardClick(e) {
  // 밀기를 끝낸 클릭은 이동으로 치지 않는다
  if (suppressClick) {
    suppressClick = false
    e.stopPropagation()
    e.preventDefault()
    return
  }
  // 접힌 더미를 누르면 먼저 펼친다 (바로 이동하지 않게)
  if (!expanded.value && laidOut.value.length > 1) {
    pinned.value = true
    e.stopPropagation()
    e.preventDefault()
  }
}

// 지운 알림이 실제로 목록에서 빠지면 표시를 정리
watch(
  () => props.items.map((a) => a.id).join(),
  () => {
    const ids = new Set(props.items.map((a) => a.id))
    leaving.value = new Set([...leaving.value].filter((id) => ids.has(id)))
    for (const id of [...dismissed]) if (!ids.has(id)) dismissed.delete(id)
  },
)

onBeforeUnmount(() => {
  ro.disconnect()
  for (const f of frames.values()) cancelAnimationFrame(f)
})
defineExpose({ collapse: () => (pinned.value = false) })
</script>

<template>
  <div
    @pointerenter="(e) => e.pointerType === 'mouse' && (hovered = true)"
    @pointerleave="(e) => e.pointerType === 'mouse' && (hovered = false)"
    @focusin="focused = true"
    @focusout="(e) => !e.currentTarget.contains(e.relatedTarget) && (focused = false)"
  >
    <div v-if="laidOut.length > 1" class="mb-2 flex justify-end">
      <button type="button" :aria-expanded="expanded" class="rounded-md px-2 py-0.5 text-xs font-semibold text-[#6b717d] transition-colors hover:bg-muted hover:text-[#111]" @click="pinned = !pinned">
        {{ expanded ? '접기' : `모두 보기 (${laidOut.length})` }}
      </button>
    </div>
    <ol aria-label="알림" class="relative transition-[height] duration-300 ease-[var(--ease-out)]" :style="{ height: `${stackHeight}px` }" tabindex="-1">
      <li
        v-for="a in items"
        :key="a.id"
        :ref="liRef"
        :data-id="a.id"
        :style="layout(a).style"
        class="absolute inset-x-0 top-0 origin-top transition-[transform,opacity] duration-300 ease-[var(--ease-out)]"
      >
        <div
          :ref="(el) => (el ? swipeNodes.set(a.id, el) : swipeNodes.delete(a.id))"
          class="touch-pan-y"
          @pointerdown="(e) => onDown(e, layout(a).depth, a)"
          @pointermove="(e) => onMove(e, a)"
          @pointerup="(e) => onUp(e, a)"
          @pointercancel="(e) => onUp(e, a)"
          @lostpointercapture="(e) => e.target === e.currentTarget && onUp(e, a)"
        >
          <article
            :class="[layout(a).muted ? '[&>*]:opacity-0' : '', !expanded && layout(a).depth === 0 && laidOut.length > 1 ? 'cursor-pointer' : '']"
            class="select-none overflow-hidden rounded-xl border bg-card shadow-[0_1px_3px_rgb(16_24_40/0.06)] [&>*]:transition-opacity [&>*]:duration-200"
            @click.capture="onCardClick"
          >
            <AlertItem :alert="a" @open="(x) => emit('open', x)" @star="(x) => emit('star', x)" @remove="(x) => dismiss(x, 1)" />
          </article>
        </div>
      </li>
    </ol>
  </div>
</template>
