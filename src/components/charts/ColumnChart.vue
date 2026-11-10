<script setup>
import { computed } from 'vue'

// 세로 막대(그라데이션) + x축(항목 이름) · y축(눈금). 가장 많은 항목은 진한 빨강, 나머지는 옅게.
const props = defineProps({
  items: { type: Array, default: () => [] }, // [{ key, label, value }]
  unit: { type: String, default: '건' },
  height: { type: Number, default: 150 }, // 그래프 영역 높이(px)
  yLabel: String,
  xLabel: String,
  visible: { type: Number, default: 0 }, // 한 화면에 보일 막대 수 (넘으면 가로 스크롤, 0이면 전부 한 화면)
})
// 가로 스크롤 시 안쪽 너비: 전체 막대 수 / 보일 막대 수 × 100%
const innerWidth = computed(() =>
  props.visible && props.items.length > props.visible ? `${(props.items.length / props.visible) * 100}%` : '100%',
)

// 보기 좋은 눈금 (1·2·2.5·5 × 10^n 간격, 4칸 안팎)
const scale = computed(() => {
  const max = Math.max(1, ...props.items.map((i) => i.value))
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) * mag
  const top = Math.ceil((max * 1.08) / step) * step // 맨 위 막대의 값 라벨이 들어갈 여백
  const ticks = []
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10)
  return { max, top, ticks }
})
const total = computed(() => props.items.reduce((s, i) => s + i.value, 0) || 1)
const pct = (v) => Math.round((v / total.value) * 1000) / 10
const cols = computed(() => ({ gridTemplateColumns: `repeat(${Math.max(1, props.items.length)}, minmax(0, 1fr))` }))
</script>

<template>
  <div class="text-[11px] text-chart-label">
    <p v-if="yLabel" class="mb-3">{{ yLabel }}</p>
    <div class="flex">
      <!-- y축 (가로 스크롤해도 고정) -->
      <div class="relative mr-2 w-9 shrink-0" :style="{ height: height + 'px' }">
        <span
          v-for="t in scale.ticks" :key="t"
          class="absolute right-0 tabular"
          :style="{ bottom: (t / scale.top) * 100 + '%', transform: 'translateY(50%)' }"
        >{{ t.toLocaleString() }}</span>
      </div>
      <!-- 그래프 + x축 이름: 함께 가로 스크롤 -->
      <div class="min-w-0 flex-1 overflow-x-auto pb-1">
        <div :style="{ width: innerWidth }">
          <div class="relative border-b border-l border-[#d5d9df]" :style="{ height: height + 'px' }">
            <i
              v-for="t in scale.ticks.slice(1)" :key="t"
              class="absolute inset-x-0 border-t border-dashed border-chart-grid"
              :style="{ bottom: (t / scale.top) * 100 + '%' }"
            />
            <div class="relative grid h-full items-end gap-3 px-3" :style="cols">
              <div
                v-for="it in items" :key="it.key"
                class="group relative flex h-full items-end justify-center"
                :title="`${it.label}, ${it.value.toLocaleString()}${unit} (${pct(it.value)}%)`"
              >
                <div
                  :class="it.value === scale.max ? 'from-[#ff5a78] to-sk-red' : 'from-[#fbd3db] to-sk-red-light'"
                  class="relative w-1/2 min-w-6 max-w-24 rounded-t-[6px] bg-linear-to-b transition-opacity group-hover:opacity-80"
                  :style="{ height: Math.max(1.5, (it.value / scale.top) * 100) + '%' }"
                >
                  <span
                    :class="it.value === scale.max ? 'font-bold text-primary' : 'font-semibold text-foreground'"
                    class="absolute inset-x-[-1rem] -top-5 text-center text-[13px] tabular"
                  >{{ it.value.toLocaleString() }}<small class="ml-0.5 font-medium text-muted-foreground">({{ pct(it.value) }}%)</small></span>
                </div>
              </div>
            </div>
          </div>
          <div class="grid gap-3 px-3 pt-2" :style="cols">
            <span v-for="it in items" :key="it.key" class="line-clamp-2 break-keep text-center text-[14px] font-semibold leading-[1.3] text-foreground" :title="it.label">{{ it.label }}</span>
          </div>
        </div>
      </div>
    </div>
    <p v-if="xLabel" class="mt-1 text-right">{{ xLabel }}</p>
  </div>
</template>
