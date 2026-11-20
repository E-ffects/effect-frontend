<script setup>
import { computed } from 'vue'
import { Check, Loader2 } from 'lucide-vue-next'
import { AGENT_STEPS } from '@/lib/caseLabels'

// 에이전트 7단계 진행 (AI 명세 trace 순서). 진행 중에는 progress.steps_done, 완료면 trace의 실제 기록을 보여 준다
const props = defineProps({ analysis: Object })

const state = computed(() => props.analysis?.analysis_state || 'NOT_REQUESTED')
const done = computed(() => {
  if (['SUCCEEDED', 'PARTIAL'].includes(state.value)) return 7
  if (state.value === 'RUNNING') return props.analysis.progress?.steps_done ?? 0
  return 0
})
const trace = computed(() => props.analysis?.trace || [])
const status = (i) => (i < done.value ? 'done' : i === done.value && ['RUNNING', 'QUEUED'].includes(state.value) ? 'now' : 'todo')
</script>

<template>
  <ol class="grid grid-cols-7 gap-2" aria-label="에이전트 진행 단계">
    <li v-for="(s, i) in AGENT_STEPS" :key="i" class="min-w-0">
      <div class="flex items-center gap-2">
        <span
          :class="{
            'bg-emerald-600 text-white': status(i) === 'done',
            'bg-primary text-white': status(i) === 'now',
            'bg-muted text-muted-foreground': status(i) === 'todo',
          }"
          class="grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold"
        >
          <Check v-if="status(i) === 'done'" class="size-3.5" />
          <Loader2 v-else-if="status(i) === 'now'" class="size-3.5 animate-spin" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span v-if="i < 6" :class="i < done - 1 ? 'bg-emerald-600' : 'bg-border'" class="h-0.5 flex-1 rounded-full" />
      </div>
      <p :class="status(i) === 'todo' ? 'text-muted-foreground' : 'text-foreground'" class="mt-2 text-[13px] font-semibold">{{ s.label }}</p>
      <p class="text-xs leading-snug text-muted-foreground">{{ s.desc }}</p>
      <p v-if="trace[i]" class="mt-1 line-clamp-2 text-[12px] leading-snug text-[#4a505c]" :title="trace[i].action">{{ trace[i].action }}</p>
    </li>
  </ol>
</template>
