<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2 } from 'lucide-vue-next'
import Dialog from './ui/Dialog.vue'
import Button from './ui/Button.vue'
import Badge from './ui/Badge.vue'
import Skeleton from './ui/Skeleton.vue'
import ReportBody from './ReportBody.vue'
import { api, fmtDateTime } from '@/lib/api'
import { auth } from '@/lib/state'

const open = defineModel('open', { type: Boolean })
const props = defineProps({ rmaId: String })
const emit = defineEmits(['changed'])
const router = useRouter()
const report = ref(null)
const state = ref('idle') // loading | generating | ready | error
const error = ref('')

watch(
  () => [open.value, props.rmaId],
  async ([o]) => {
    if (!o || !props.rmaId) return
    report.value = null
    error.value = ''
    state.value = 'loading'
    try {
      report.value = await api(`/reports/${props.rmaId}`)
      state.value = 'ready'
    } catch (e) {
      if (e.status !== 404 || e.message !== '보고서가 없습니다') return fail(e)
      // 없으면 생성 후 표시 (최대 30초)
      state.value = 'generating'
      try {
        report.value = await api(`/reports/${props.rmaId}`, { method: 'POST' })
        state.value = 'ready'
        emit('changed')
      } catch (e2) {
        fail(e2)
      }
    }
  },
)

function fail(e) {
  state.value = 'error'
  error.value = e.status === 503 ? 'AI 일시 불가 — 기존 보고서가 없어 지금은 생성할 수 없습니다' : e.message
}

function go(path) {
  open.value = false
  router.push(path)
}
</script>

<template>
  <Dialog v-model:open="open" :title="report?.content.title || `${rmaId} AI 분석 보고서`" width="max-w-2xl">
    <div v-if="state === 'loading'" class="space-y-3"><Skeleton class="h-5 w-1/2" /><Skeleton class="h-20" /><Skeleton class="h-20" /></div>
    <div v-else-if="state === 'generating'" class="space-y-3 py-6 text-center text-sm text-muted-foreground">
      <div class="mx-auto h-1.5 w-56 overflow-hidden rounded-full bg-muted"><div class="h-full w-1/3 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-primary" /></div>
      보고서가 없어 새로 생성하고 있습니다… (최대 30초)
    </div>
    <p v-else-if="state === 'error'" class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{{ error }}</p>
    <template v-else-if="report">
      <div class="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        생성 {{ fmtDateTime(report.generated_at) }}
        <Badge v-if="report.reviewed" tone="green"><CheckCircle2 class="size-3" />확인 완료, {{ report.reviewed_by }}, {{ fmtDateTime(report.reviewed_at) }}</Badge>
        <Badge v-else tone="yellow">검토 미확인</Badge>
      </div>
      <ReportBody :content="report.content" :focus="auth.user?.role === 'CS' ? 'cs' : 'quality'" @open-rma="(id) => go({ path: '/rmas', query: { open: id } })" />
    </template>
    <template #footer>
      <Button v-if="auth.user?.role === 'QUALITY'" variant="outline" @click="go({ path: '/quality/reports', query: { rmaId } })">보고서 화면에서 보기</Button>
      <Button v-else variant="outline" @click="go({ path: '/rmas', query: { open: rmaId } })">RMA 상세 보기</Button>
    </template>
  </Dialog>
</template>
