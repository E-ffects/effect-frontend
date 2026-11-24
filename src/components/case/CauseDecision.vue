<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ChevronRight, ShieldCheck } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import SubmitButton from '@/components/ui/SubmitButton.vue'
import { api } from '@/lib/api'
import { toast } from '@/lib/state'
import { APPROVAL, LEVEL_TONE, pick } from '@/lib/caseLabels'

// 원인 판정 (Spring_API_v6 6-1): 후보마다 채택·기각 + 건 전체 승인·반려(L3) / 확인(L1·L2)
// 모양과 움직임은 Kokonut UI "AI Tool Approval"(MIT)을 옮겼다:
// 회색 받침 위 승인 요청 카드 → 결정하면 카드가 위로 사라지고 한 줄 기록(체크가 그려짐)이 펼쳐진다
const props = defineProps({ rmaId: String, analysis: Object, level: String, approvalStatus: String })
const emit = defineEmits(['decided'])

const candidates = computed(() => props.analysis?.result?.cause_candidates || [])
const marks = reactive({})
watch(candidates, (list) => {
  for (const c of list) marks[c.cause_code] ??= c.rank === 1 ? 'ADOPTED' : 'REJECTED'
}, { immediate: true })
const comment = ref('')
const rejecting = ref(false)
const isL3 = computed(() => props.level === 'L3')
const adopted = computed(() => candidates.value.find((c) => marks[c.cause_code] === 'ADOPTED'))
const closed = computed(() => ['APPROVED', 'CONFIRMED'].includes(props.approvalStatus))

// 이 화면에서 방금 내린 판정 (한 줄 기록에 쓴다). 새 분석이 오면 지운다
const decided = ref(null)
const showComment = ref(false)
watch(() => props.analysis?.analysis_id, () => (decided.value = null))
const showCard = computed(() => !closed.value && !decided.value)

function adopt(code) {
  for (const c of candidates.value) marks[c.cause_code] = c.cause_code === code ? 'ADOPTED' : 'REJECTED'
}

async function send(decision) {
  if (decision === 'REJECTED') for (const c of candidates.value) marks[c.cause_code] = 'REJECTED'
  await api(`/rmas/${props.rmaId}/cause-decision`, {
    method: 'POST',
    body: {
      analysis_id: props.analysis.analysis_id,
      decision,
      candidates: candidates.value.map((c) => ({ cause_code: c.cause_code, status: marks[c.cause_code] })),
      comment: comment.value.trim(),
    },
  })
}

// 승인·확인: 버튼이 원으로 접혀 돈 뒤 초록으로 펴진다(SubmitButton). 완료 모습 뒤 카드 → 한 줄 기록
const checkAdopted = () => (adopted.value ? true : (toast({ title: '확정할 원인 하나를 채택해 주세요', tone: 'red' }), false))
async function confirm() {
  try {
    await send(isL3.value ? 'APPROVED' : 'CONFIRMED')
    return true
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
    return false
  }
}
function afterConfirm() {
  const c = adopted.value
  decided.value = { ok: true, verb: isL3.value ? '승인함' : '확인함', what: `${c.cause_name}${c.equipment_id ? ` · ${c.equipment_id}` : ''}`, comment: comment.value.trim() }
  toast({ title: `${c.cause_name}을(를) 확정 원인으로 저장했습니다`, tone: 'green' })
  setTimeout(() => emit('decided'), 300)
}

async function reject() {
  rejecting.value = true
  try {
    await send('REJECTED')
    decided.value = { ok: false, verb: '반려함', what: '원인 후보 전체', comment: comment.value.trim() }
    toast({ title: '반려했습니다. 재분석할 수 있습니다' })
    setTimeout(() => emit('decided'), 300)
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    rejecting.value = false
  }
}
</script>

<template>
  <section aria-label="원인 판정" class="rounded-2xl bg-[#eff1f4] p-1.5">
    <!-- 결정된 판정: 한 줄 기록 -->
    <Transition
      enter-from-class="grid-rows-[0fr] opacity-0"
      enter-to-class="grid-rows-[1fr] opacity-100"
      enter-active-class="transition-[grid-template-rows,opacity] duration-[240ms] ease-[var(--ease-out)]"
    >
      <div v-if="decided || closed" class="grid">
        <div class="min-h-0 overflow-hidden px-2.5 py-1">
          <button
            type="button"
            class="group flex w-full items-center gap-2.5 rounded-md py-1.5 text-left text-[13px] leading-5 disabled:cursor-default"
            :disabled="!decided?.comment"
            :aria-expanded="decided?.comment ? showComment : undefined"
            @click="showComment = !showComment"
          >
            <span class="flex size-4 shrink-0 items-center justify-center">
              <svg v-if="!decided || decided.ok" aria-hidden="true" class="size-3.5 text-emerald-600" fill="none" viewBox="0 0 16 16">
                <path class="draw-check" pathLength="1" d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" />
              </svg>
              <svg v-else aria-hidden="true" class="size-3.5 text-[#9aa0aa]" fill="none" viewBox="0 0 16 16">
                <path d="M4.5 4.5l7 7m0-7-7 7" stroke="currentColor" stroke-linecap="round" stroke-width="1.75" />
              </svg>
            </span>
            <template v-if="decided">
              <span class="shrink-0 text-[#4a505c]">{{ decided.verb }}</span>
              <b :class="decided.ok ? 'text-[#111]' : 'text-[#9aa0aa] line-through decoration-[#cfd3da]'" class="min-w-0 truncate font-semibold">{{ decided.what }}</b>
              <ChevronRight v-if="decided.comment" aria-hidden="true" :class="showComment ? 'rotate-90' : ''" class="ml-auto size-3.5 shrink-0 text-[#9aa0aa] transition-transform duration-200 ease-[var(--ease-out)] group-hover:text-[#4a505c]" />
            </template>
            <span v-else class="min-w-0 text-[#4a505c]">원인을 확정했습니다. 확정 원인은 사례 저장소에 들어가 다음 반품 분석의 과거 사례로 쓰입니다.</span>
          </button>
          <div v-if="decided?.comment" class="fold" :data-open="showComment">
            <p class="mb-1.5 ml-6.5 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-[#4a505c] ring-1 ring-black/5">{{ decided.comment }}</p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 승인 요청 카드 -->
    <Transition
      enter-from-class="opacity-0 translate-y-2 blur-[2px]"
      leave-to-class="opacity-0 -translate-y-1.5 blur-[2px]"
      enter-active-class="transition-[opacity,translate,filter] duration-[220ms] ease-[var(--ease-out)]"
      leave-active-class="transition-[opacity,translate,filter] duration-[220ms] ease-[var(--ease-out)]"
    >
      <div v-if="showCard" class="rounded-xl bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-black/5">
        <header class="mb-2.5 flex items-center gap-2">
          <ShieldCheck class="size-4 shrink-0 text-primary" aria-hidden="true" />
          <h3 class="text-[15px] font-bold">{{ isL3 ? '원인 확정 승인' : '원인 확인' }}</h3>
          <Badge :tone="LEVEL_TONE[level]">{{ level }}</Badge>
          <Badge :tone="pick(APPROVAL, approvalStatus).tone">{{ pick(APPROVAL, approvalStatus).label }}</Badge>
        </header>

        <ul class="grid gap-1 rounded-lg bg-[#f7f8fa] p-1.5 ring-1 ring-black/5" role="radiogroup" aria-label="채택할 원인">
          <li v-for="c in candidates" :key="c.cause_code">
            <label
              :class="marks[c.cause_code] === 'ADOPTED' ? 'bg-white shadow-[0_1px_3px_rgb(16_24_40/0.08)] ring-1 ring-emerald-600/40' : 'hover:bg-white/70'"
              class="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-[background-color,box-shadow] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
            >
              <input type="radio" name="adopt" class="sr-only" :checked="marks[c.cause_code] === 'ADOPTED'" @change="adopt(c.cause_code)" />
              <span class="w-4 text-xs font-bold text-muted-foreground tabular">{{ c.rank }}</span>
              <span class="min-w-0 flex-1 truncate font-medium">{{ c.cause_name }}<span v-if="c.equipment_id" class="font-normal text-muted-foreground"> · {{ c.equipment_id }}</span></span>
              <Badge :tone="marks[c.cause_code] === 'ADOPTED' ? 'green' : 'gray'">{{ marks[c.cause_code] === 'ADOPTED' ? '채택' : '기각' }}</Badge>
            </label>
          </li>
        </ul>
        <p class="mt-2 text-xs leading-relaxed text-muted-foreground">{{ isL3 ? 'L3(Major)는 품질관리자 승인이 필요합니다.' : 'L1·L2는 확인으로 확정합니다.' }} 채택은 하나만 고를 수 있습니다.</p>

        <label class="mt-3 grid gap-1 text-xs font-semibold">검토 의견
          <textarea v-model="comment" rows="2" placeholder="예: OLE-02 압력 이탈과 노즐 점검 기록 확인. 회송 시료 단면 분석 예정" class="resize-y rounded-md border bg-card px-2.5 py-1.5 text-sm font-normal placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
        </label>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <span v-if="isL3" class="text-xs text-[#9aa0aa]">L3는 건마다 승인합니다</span>
          <div class="ml-auto flex items-center gap-1.5">
            <button
              v-if="isL3"
              type="button"
              :disabled="rejecting"
              class="h-9 rounded-full px-4 text-sm font-semibold text-[#4a505c] transition-colors duration-150 hover:bg-[#f0f2f5] hover:text-[#111] active:bg-[#e6e8ec] disabled:opacity-50"
              @click="reject"
            >반려</button>
            <SubmitButton :check="checkAdopted" :action="confirm" :success-label="isL3 ? '승인 완료' : '확인 완료'" @done="afterConfirm">
              {{ isL3 ? '승인' : '확인' }}<template v-if="adopted"> · {{ adopted.cause_name }}</template>
            </SubmitButton>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>
