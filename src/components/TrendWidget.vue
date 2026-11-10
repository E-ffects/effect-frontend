<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Card from './ui/Card.vue'
import Select from './ui/Select.vue'
import Skeleton from './ui/Skeleton.vue'
import WeeklyChart from './charts/WeeklyChart.vue'
import { api } from '@/lib/api'
import { useMeta } from '@/lib/meta'

// 불량·접수 발생 추이 (v4): 제목 · 우측 제품/불량 유형 선택 · y축 이름 · 주차별 선 · 우하단 x축 이름과 기간
const props = defineProps({ title: String, from: String, to: String, yLabel: String, chartHeight: { type: Number, default: 170 } })
const router = useRouter()
const meta = useMeta()
// 선택한 제품·불량 유형은 브라우저에 기억해 다른 화면에 다녀오거나 새로고침해도 유지한다
// (품질·CS 대시보드 따로: 위젯 제목은 사용자가 바꿀 수 있어 y축 이름으로 구분)
const storeKey = `rma.trend.${props.yLabel || 'default'}`
function loadFilter() {
  try {
    return JSON.parse(localStorage.getItem(storeKey)) || {}
  } catch {
    return {}
  }
}
const saved = loadFilter()
const product = ref(saved.product || '')
const defectType = ref(saved.defectType || '')
const data = ref(null)

watch([product, defectType], ([p, d]) => {
  try {
    if (p || d) localStorage.setItem(storeKey, JSON.stringify({ product: p, defectType: d }))
    else localStorage.removeItem(storeKey)
  } catch {
    /* 저장할 수 없는 환경: 이번 화면에서만 유지 */
  }
})

// 저장된 값이 더 이상 목록에 없으면 (데이터 교체 등) 전체로 되돌린다
watch(meta, (m) => {
  if (!m) return
  if (product.value && !m.products?.some((p) => p.code === product.value)) product.value = ''
  if (defectType.value && !m.defect_types?.some((d) => (d?.value ?? d) === defectType.value)) defectType.value = ''
}, { immediate: true })

watch(
  () => [props.from, props.to, product.value, defectType.value],
  async () => {
    data.value = null
    data.value = await api('/dashboard/trend', { query: { from: props.from, to: props.to, product: product.value, defectType: defectType.value } })
  },
  { immediate: true },
)

function select(p) {
  router.push({ path: '/rmas', query: { from: p.from, to: p.to, product: product.value || undefined, defectType: defectType.value || undefined } })
}
</script>

<template>
  <!-- 같은 줄의 TOP 5·순위 카드와 높이를 맞추려고 선택 칸은 제목 줄에, x축 안내는 한 줄로 둔다 -->
  <Card :title="title" class="h-full">
    <template #actions>
      <Select v-model="product" size="sm" class="w-36" placeholder="전체 제품" :options="(meta?.products || []).map((p) => ({ value: p.code, label: `${p.code} ${p.name}` }))" />
      <Select v-model="defectType" size="sm" class="w-36" placeholder="전체 불량 유형" :options="meta?.defect_types || []" />
    </template>
    <p class="-mt-1 mb-1 text-[12px] text-chart-label">{{ yLabel }}</p>
    <Skeleton v-if="!data" :style="{ height: chartHeight + 'px' }" />
    <p v-else-if="!data.points.some((p) => p.count)" :style="{ height: chartHeight + 'px' }" class="flex items-center justify-center text-sm text-muted-foreground">선택 조건에 발생 사례가 없습니다</p>
    <WeeklyChart v-else :points="data.points" :markers="data.countermeasures" :y-label="yLabel" :height="chartHeight" @select="select" />
  </Card>
</template>
