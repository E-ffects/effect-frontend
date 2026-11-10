<script setup>
import AiDisclaimer from './AiDisclaimer.vue'

// 보고서 본문. changed(바뀐 항목 이름)가 있으면 그 절에 '변경' 표시 — highlight는 새 초안 쪽 강조색.
const props = defineProps({
  content: Object,
  focus: { type: String, default: 'quality' },
  changed: { type: Array, default: () => [] },
  highlight: Boolean,
})
defineEmits(['open-rma'])

const isChanged = (...labels) => labels.some((l) => props.changed.includes(l))
const boxCls = (...labels) =>
  isChanged(...labels) ? ['-mx-3 rounded-lg px-3 py-2.5', props.highlight ? 'bg-brand-soft ring-1 ring-brand-line' : 'bg-muted/70'] : ''
</script>

<template>
  <!-- 보고서 본문: 16px · 줄간격 1.8 · 한 줄 최대 880px (긴 문장이 화면 끝까지 늘어지지 않게) -->
  <div class="max-w-[880px] space-y-8 text-[16px] leading-[1.8] text-[#2b2f38]">
    <section :class="boxCls('주요 원인')">
      <h4 class="mb-3 flex items-center gap-2.5 text-[17px] font-bold tracking-[-0.02em] text-foreground">
        <span class="text-[14px] font-extrabold text-primary tabular">01</span>주요 원인 분석
        <span v-if="isChanged('주요 원인')" class="ml-auto rounded bg-primary px-1.5 py-0.5 text-[12px] font-bold text-white">변경</span>
      </h4>
      <p>{{ content.main_cause }}</p>
    </section>
    <section :class="boxCls('과거 유사 사례')">
      <h4 class="mb-3 flex items-center gap-2.5 text-[17px] font-bold tracking-[-0.02em] text-foreground">
        <span class="text-[14px] font-extrabold text-primary tabular">02</span>과거 유사 사례
        <span v-if="isChanged('과거 유사 사례')" class="ml-auto rounded bg-primary px-1.5 py-0.5 text-[12px] font-bold text-white">변경</span>
      </h4>
      <ul class="space-y-1.5">
        <li v-for="s in content.similar" :key="s" class="rounded-lg bg-muted/70 px-4 py-2.5 text-[15px] font-medium leading-relaxed">{{ s }}</li>
      </ul>
    </section>
    <section :class="boxCls('품질 개선 권고', '고객 응대 권고')">
      <h4 class="mb-3 flex items-center gap-2.5 text-[17px] font-bold tracking-[-0.02em] text-foreground">
        <span class="text-[14px] font-extrabold text-primary tabular">03</span>{{ focus === 'cs' ? '응대 권고' : '개선 및 응대 권고' }}
        <span v-if="isChanged('품질 개선 권고', '고객 응대 권고')" class="ml-auto rounded bg-primary px-1.5 py-0.5 text-[12px] font-bold text-white">변경</span>
      </h4>
      <ol class="space-y-3">
        <li v-if="focus === 'quality'" class="flex gap-2"><b class="w-[5rem] shrink-0 font-bold text-foreground">품질 개선</b><span>{{ content.quality_recommendation }}</span></li>
        <li class="flex gap-2"><b class="w-[5rem] shrink-0 font-bold text-foreground">고객 응대</b><span>{{ content.cs_recommendation }}</span></li>
      </ol>
    </section>
    <section :class="boxCls('근거 RMA')">
      <h4 class="mb-3 flex items-center gap-2.5 text-[17px] font-bold tracking-[-0.02em] text-foreground">
        <span class="text-[14px] font-extrabold text-primary tabular">04</span>근거 RMA
        <span v-if="isChanged('근거 RMA')" class="ml-auto rounded bg-primary px-1.5 py-0.5 text-[12px] font-bold text-white">변경</span>
      </h4>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="id in content.evidence"
          :key="id"
          class="rounded-md bg-brand-soft px-2.5 py-1 text-[14px] font-bold text-primary hover:bg-brand-line/60"
          @click="$emit('open-rma', id)"
        >{{ id }} ↗</button>
      </div>
    </section>
    <AiDisclaimer :text="content.disclaimer" />
  </div>
</template>
