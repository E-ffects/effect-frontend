<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowRight, Settings2, Sparkles } from 'lucide-vue-next'
import Button from './ui/Button.vue'
import DateRange from './ui/DateRange.vue'
import Skeleton from './ui/Skeleton.vue'
import PageHead from './PageHead.vue'
import { api } from '@/lib/api'
import { useMeta } from '@/lib/meta'
import { aiState } from '@/lib/state'

// ④ AI 주요 이슈 요약은 집계와 별도로 불러온다 (실패해도 이 영역만 "AI 일시 불가")
// link: AI INSIGHT에서 바로 이동할 곳 { label, to } (품질: 불량 패턴 분석, 고객대응: RMA 상세)
const props = defineProps({ title: String, tagline: String, from: String, to: String, prev: Array, summaryPath: String, editing: Boolean, link: Object, crumb: { type: Boolean, default: true } })
const meta = useMeta()
defineEmits(['apply', 'edit'])

const summary = ref(null)
const state = ref('loading') // loading | done | failed

watch(
  () => [props.from, props.to, aiState.available],
  async () => {
    state.value = 'loading'
    try {
      summary.value = (await api(props.summaryPath, { query: { from: props.from, to: props.to } })).summary
      state.value = 'done'
    } catch {
      state.value = 'failed'
    }
  },
  { immediate: true },
)

// 요약 문장 강조 (v4 AI INSIGHT): 제품·불량 유형·RMA ID는 진하게, 단위가 붙은 숫자는 SK Red로
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const parts = computed(() => {
  const text = summary.value || ''
  const types = (meta.value?.defect_types || []).slice().sort((a, b) => b.length - a.length).map(esc)
  const subject = `PRD-[A-Z](?:\\s*(?:${types.join('|') || '(?!)'}))?|RMA-\\d{4}`
  const number = '\\d[\\d,.]*\\s?(?:%p|%|건|개|일|대|억원|만원|원)'
  const re = new RegExp(`(${subject})|(${number})`, 'g')
  const out = []
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) })
    out.push({ t: m[0], k: m[1] ? 'subject' : 'num' })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: text.slice(last) })
  return out
})
const source = computed(() => (aiState.provider?.startsWith('gemini') ? 'Gemini 요약' : '규칙 기반 요약'))
</script>

<template>
  <PageHead :title="title" :crumb="crumb">
    <template #description>
      {{ tagline }}<span v-if="prev" class="text-[#6f7684]">, 직전 대비 비교 기간 {{ prev[0] }} ~ {{ prev[1] }}</span>
    </template>
    <template #actions>
      <DateRange :from="from" :to="to" @apply="$emit('apply', $event)" />
      <Button variant="outline" size="sm" :disabled="editing" @click="$emit('edit')"><Settings2 class="size-3.5" />위젯 편집</Button>
    </template>
  </PageHead>
  <div class="mb-6 flex items-center gap-4 rounded-[14px] border border-[#f6d4db] bg-card px-5 py-3.5 shadow-[0_2px_12px_#ea002c0d]">
    <span class="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-primary"><Sparkles class="size-[18px]" /></span>
    <span class="shrink-0 text-[12px] font-extrabold tracking-[0.8px] text-primary">AI INSIGHT</span>
    <Skeleton v-if="state === 'loading'" class="h-4 flex-1" />
    <p v-else-if="state === 'done'" class="min-w-0 text-sm leading-relaxed text-[#3a404b]">
      <template v-for="(x, i) in parts" :key="i">
        <b v-if="x.k === 'subject'" class="font-bold text-foreground">{{ x.t }}</b>
        <b v-else-if="x.k === 'num'" class="font-bold text-primary tabular">{{ x.t }}</b>
        <template v-else>{{ x.t }}</template>
      </template>
      <span class="ml-1 whitespace-nowrap text-[12px] text-muted-foreground">{{ source }}</span>
    </p>
    <p v-else class="text-sm text-[#c4621a]">AI 일시 불가 — 요약을 생성할 수 없습니다. 아래 집계는 정상입니다.</p>
    <RouterLink
      v-if="link && state !== 'loading'"
      :to="link.to"
      class="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[14px] font-semibold text-primary transition-colors hover:bg-brand-soft"
    >
      {{ link.label }}<ArrowRight class="size-4" />
    </RouterLink>
  </div>
</template>
