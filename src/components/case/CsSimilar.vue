<script setup>
import { computed, ref, watch } from 'vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { api, fmtDate } from '@/lib/api'

// 고객대응관리자용 과거 유사 사례 (Spring GET /api/rmas/{rmaId}/similar, CS 응답)
// CS는 원인·설비 없이 접수일·증상·유사도·처리 소요 일수만 받는다 → 고객 안내용 예상 소요 기간
const props = defineProps({ rmaId: String })
const data = ref(null)
const failed = ref('')

watch(
  () => props.rmaId,
  async (id) => {
    data.value = null
    failed.value = ''
    try {
      data.value = await api(`/rmas/${id}/similar`, { query: { limit: 5 } })
    } catch (e) {
      failed.value = e.message
    }
  },
  { immediate: true },
)

// 처리가 끝난 과거 건만 (같은 날 접수된 미처리 건은 소요 일수가 의미 없다)
const done = computed(() => (data.value?.items || []).filter((x) => x.rma_id !== props.rmaId && x.days_to_resolve > 0))
const median = computed(() => {
  const d = done.value.map((x) => x.days_to_resolve).sort((a, b) => a - b)
  if (!d.length) return null
  const m = Math.floor(d.length / 2)
  return d.length % 2 ? d[m] : Math.round((d[m - 1] + d[m]) / 2)
})
</script>

<template>
  <section class="rounded-[14px] border bg-card p-5" aria-labelledby="cs-similar-title">
    <div class="flex items-baseline justify-between gap-3">
      <h3 id="cs-similar-title" class="text-[15px] font-bold">비슷한 과거 사례</h3>
      <span class="text-xs text-muted-foreground">같은 증상 기준</span>
    </div>
    <Skeleton v-if="!data && !failed" class="mt-3 h-24" />
    <p v-else-if="failed" class="mt-3 text-sm text-muted-foreground">유사 사례를 불러오지 못했습니다. {{ failed }}</p>
    <p v-else-if="!done.length" class="mt-3 text-sm text-muted-foreground">처리가 끝난 비슷한 사례가 없습니다.</p>
    <template v-else>
      <p class="mt-2 text-sm">
        비슷한 사례는 보통 <b class="font-semibold tabular">{{ median }}일</b> 안에 처리됐습니다.
        <span class="text-muted-foreground">고객 안내 시 참고하세요.</span>
      </p>
      <table class="mt-3 w-full text-left text-sm">
        <thead class="text-xs text-muted-foreground">
          <tr class="[&_th]:pb-1.5 [&_th]:font-medium"><th>RMA</th><th>접수일</th><th>증상</th><th class="text-right">유사도</th><th class="text-right">처리 소요</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in done" :key="s.rma_id" class="border-t [&_td]:py-2">
            <td class="font-medium tabular">{{ s.rma_id }}</td>
            <td class="tabular">{{ fmtDate(s.opened_at) }}</td>
            <td>{{ s.minor_name || '—' }}</td>
            <td class="text-right tabular">{{ Math.round((s.similarity ?? 0) * 100) }}%</td>
            <td class="text-right tabular">{{ s.days_to_resolve }}일</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>
