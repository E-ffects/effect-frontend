<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Dialog from './ui/Dialog.vue'
import Button from './ui/Button.vue'
import Skeleton from './ui/Skeleton.vue'
import AiDisclaimer from './AiDisclaimer.vue'
import { api } from '@/lib/api'

const open = defineModel('open', { type: Boolean })
const props = defineProps({ patternId: String, from: String, to: String, showLink: { type: Boolean, default: true } })
const router = useRouter()
const data = ref(null)
const error = ref('')

watch(
  () => [open.value, props.patternId],
  async ([o]) => {
    if (!o || !props.patternId) return
    data.value = null
    error.value = ''
    try {
      data.value = await api(`/dashboard/pattern-report/${props.patternId}`, { query: { from: props.from, to: props.to } })
    } catch (e) {
      error.value = e.status === 503 ? 'AI 일시 불가 — 잠시 후 다시 시도하세요' : e.message
    }
  },
)

function goPatterns() {
  open.value = false
  router.push({ path: '/quality/patterns', query: { patternId: props.patternId, from: props.from, to: props.to } })
}
</script>

<template>
  <Dialog v-model:open="open" :title="data?.title || '패턴 요약 보고서'" width="max-w-2xl">
    <p v-if="error" class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{{ error }}</p>
    <div v-else-if="!data" class="space-y-3"><Skeleton class="h-5 w-2/3" /><Skeleton class="h-16" /><Skeleton class="h-16" /></div>
    <div v-else class="space-y-4 text-sm">
      <section><h4 class="mb-1 text-xs font-semibold text-muted-foreground">1. 주요 원인</h4><p>{{ data.main_cause }}</p></section>
      <section><h4 class="mb-1 text-xs font-semibold text-muted-foreground">2. 발생 현황</h4><p>{{ data.status }}</p></section>
      <section><h4 class="mb-1 text-xs font-semibold text-muted-foreground">3. 개선 권고</h4><p>{{ data.recommendation }}</p></section>
      <section>
        <h4 class="mb-1 text-xs font-semibold text-muted-foreground">4. 근거 RMA</h4>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="id in data.evidence" :key="id" class="rounded-md border px-2 py-0.5 text-xs hover:bg-muted" @click="open = false; router.push({ path: '/rmas', query: { open: id } })">{{ id }}</button>
        </div>
      </section>
      <AiDisclaimer :text="data.disclaimer" />
    </div>
    <template v-if="showLink" #footer>
      <Button variant="outline" @click="goPatterns">불량 패턴 분석에서 보기</Button>
    </template>
  </Dialog>
</template>
