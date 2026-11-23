<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { CheckCircle2 } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import { api } from '@/lib/api'
import { toast } from '@/lib/state'
import { APPROVAL, LEVEL_TONE, pick } from '@/lib/caseLabels'

// 원인 판정 (Spring_API_v6 6-1): 후보마다 채택·기각 + 건 전체 승인·반려(L3) / 확인(L1·L2)
const props = defineProps({ rmaId: String, analysis: Object, level: String, approvalStatus: String })
const emit = defineEmits(['decided'])

const candidates = computed(() => props.analysis?.result?.cause_candidates || [])
const marks = reactive({})
watch(candidates, (list) => {
  for (const c of list) marks[c.cause_code] ??= c.rank === 1 ? 'ADOPTED' : 'REJECTED'
}, { immediate: true })
const comment = ref('')
const saving = ref(false)
const isL3 = computed(() => props.level === 'L3')
const adopted = computed(() => candidates.value.find((c) => marks[c.cause_code] === 'ADOPTED'))
const closed = computed(() => ['APPROVED', 'CONFIRMED'].includes(props.approvalStatus))

function adopt(code) {
  for (const c of candidates.value) marks[c.cause_code] = c.cause_code === code ? 'ADOPTED' : 'REJECTED'
}
function rejectAll() {
  for (const c of candidates.value) marks[c.cause_code] = 'REJECTED'
}

async function decide(decision) {
  if (decision !== 'REJECTED' && !adopted.value) return toast({ title: '확정할 원인 하나를 채택해 주세요', tone: 'red' })
  if (decision === 'REJECTED') rejectAll()
  saving.value = true
  try {
    await api(`/rmas/${props.rmaId}/cause-decision`, {
      method: 'POST',
      body: {
        analysis_id: props.analysis.analysis_id,
        decision,
        candidates: candidates.value.map((c) => ({ cause_code: c.cause_code, status: marks[c.cause_code] })),
        comment: comment.value.trim(),
      },
    })
    toast({ title: decision === 'REJECTED' ? '반려했습니다. 재분석할 수 있습니다' : `${adopted.value.cause_name}을(를) 확정 원인으로 저장했습니다`, tone: decision === 'REJECTED' ? 'default' : 'green' })
    emit('decided')
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="rounded-[14px] border-2 border-primary/25 bg-card p-5">
    <header class="flex items-center gap-2">
      <h3 class="text-[15px] font-bold">원인 판정</h3>
      <Badge :tone="LEVEL_TONE[level]">{{ level }}</Badge>
      <Badge :tone="pick(APPROVAL, approvalStatus).tone">{{ pick(APPROVAL, approvalStatus).label }}</Badge>
    </header>

    <div v-if="closed" class="mt-3 flex items-start gap-2.5 rounded-lg bg-[#eaf6f0] p-3.5 text-sm text-[#16624d]">
      <CheckCircle2 class="mt-0.5 size-4 shrink-0" />
      <p>원인을 확정했습니다. 확정 원인은 사례 저장소에 들어가 다음 반품 분석의 과거 사례로 쓰입니다.</p>
    </div>

    <template v-else>
      <p class="mt-1.5 text-xs text-muted-foreground">{{ isL3 ? 'L3(Major)는 품질관리자 승인이 필요합니다.' : 'L1·L2는 확인으로 확정합니다.' }} 채택은 하나만 고를 수 있습니다.</p>
      <ul class="mt-3 grid gap-1.5" role="radiogroup" aria-label="채택할 원인">
        <li v-for="c in candidates" :key="c.cause_code">
          <label
            :class="marks[c.cause_code] === 'ADOPTED' ? 'border-emerald-600 bg-[#eaf6f0]' : 'hover:bg-muted/60'"
            class="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
          >
            <input type="radio" name="adopt" class="sr-only" :checked="marks[c.cause_code] === 'ADOPTED'" @change="adopt(c.cause_code)" />
            <span class="w-4 text-xs font-bold text-muted-foreground tabular">{{ c.rank }}</span>
            <span class="min-w-0 flex-1 truncate font-medium">{{ c.cause_name }}<span v-if="c.equipment_id" class="font-normal text-muted-foreground"> · {{ c.equipment_id }}</span></span>
            <Badge :tone="marks[c.cause_code] === 'ADOPTED' ? 'green' : 'gray'">{{ marks[c.cause_code] === 'ADOPTED' ? '채택' : '기각' }}</Badge>
          </label>
        </li>
      </ul>
      <label class="mt-3 grid gap-1 text-xs font-semibold">검토 의견
        <textarea v-model="comment" rows="2" placeholder="예: OLE-02 압력 이탈과 노즐 점검 기록 확인. 회송 시료 단면 분석 예정" class="resize-y rounded-md border bg-card px-2.5 py-1.5 text-sm font-normal placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
      </label>
      <div class="mt-3 flex justify-end gap-2">
        <template v-if="isL3">
          <Button variant="outline" :loading="saving" @click="decide('REJECTED')">반려</Button>
          <Button :loading="saving" :disabled="!adopted" @click="decide('APPROVED')">승인<template v-if="adopted"> · {{ adopted.cause_name }}</template></Button>
        </template>
        <Button v-else :loading="saving" :disabled="!adopted" @click="decide('CONFIRMED')">확인<template v-if="adopted"> · {{ adopted.cause_name }}</template></Button>
      </div>
    </template>
  </section>
</template>
