<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Paperclip, Send, X } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import SubmitButton from '@/components/ui/SubmitButton.vue'
import FileDrop from '@/components/ui/FileDrop.vue'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHead from '@/components/PageHead.vue'
import { api, MOCK } from '@/lib/api'
import { reportLoadError, toast } from '@/lib/state'

// CS 반품 접수 (Spring_API_v6 4-2): DB 필수 정보는 폼, 고객이 보낸 내용은 원문 파일로 첨부한다.
// 접수하면 서버가 분류 → QA 판정 → 원인분석까지 자동으로 진행하고, 케이스 화면에서 결과를 본다.
const router = useRouter()
const meta = ref(null)
const RAW_EXT = ['.eml', '.txt', '.pdf']
const MAX_BYTES = 20 * 1024 * 1024

const form = reactive({
  customer_id: '', reported_part_no: '', occurred_at: '', detection_stage: '',
  claimed_defect_qty: '', input_qty: '', reported_lot_no: '', reported_date_code: '', panel_id: '', customer_request: '',
})
const rawFile = ref(null)
const rawPreview = ref('')
const others = ref([])
const tried = ref(false)
const saving = ref(false)
const serverError = ref('')

onMounted(async () => {
  try {
    meta.value = await api('/meta')
    form.occurred_at = meta.value.reference_date
  } catch (e) {
    reportLoadError(e)
  }
})

const today = computed(() => meta.value?.reference_date)
const customerOptions = computed(() => (meta.value?.customers || []).map((c) => ({ value: c.customer_id, label: c.customer_name })))
const productOptions = computed(() => (meta.value?.products || []).map((p) => ({ value: p.part_no, label: `${p.part_no} (${p.spec_id})` })))
const stageOptions = computed(() => (meta.value?.detection_stages || []).map((s) => ({ value: s.code, label: s.label })))

const n = (v) => Number(v)
const errors = computed(() => ({
  customer_id: !form.customer_id && '고객사를 선택하세요',
  reported_part_no: !form.reported_part_no && '제품 P/N을 선택하세요',
  occurred_at: (!form.occurred_at && '발생일을 입력하세요') || (today.value && form.occurred_at > today.value && '발생일은 기준일 이후일 수 없습니다'),
  detection_stage: !form.detection_stage && '발견 단계를 선택하세요',
  claimed_defect_qty: !(n(form.claimed_defect_qty) >= 1) && '1 이상 입력하세요',
  input_qty: (!(n(form.input_qty) >= 1) && '투입 수량을 입력하세요') || (n(form.input_qty) < n(form.claimed_defect_qty) && '신고 불량 수량보다 작을 수 없습니다'),
  raw_file: !rawFile.value && '고객 원문 파일을 첨부하세요',
}))
const err = (k) => (tried.value ? errors.value[k] : '')
const valid = computed(() => !Object.values(errors.value).some(Boolean))

const ext = (name) => name.slice(name.lastIndexOf('.')).toLowerCase()
// 원문 파일: 확인을 통과하면 true (FileDrop이 첨부 움직임을 보여 준 뒤 미리보기로 바뀐다)
const rawShown = ref(false)
async function setRaw(file) {
  if (!file) return false
  if (!RAW_EXT.includes(ext(file.name))) {
    toast({ title: '원문은 .eml, .txt, .pdf 파일만 올릴 수 있습니다', tone: 'red' })
    return false
  }
  if (file.size > MAX_BYTES) {
    toast({ title: '20MB 이하 파일만 올릴 수 있습니다', tone: 'red' })
    return false
  }
  rawFile.value = file
  rawPreview.value = ''
  if (ext(file.name) !== '.pdf') {
    const t = await file.text()
    const i = ext(file.name) === '.eml' ? t.search(/\r?\n\r?\n/) : -1
    rawPreview.value = (i > 0 ? t.slice(i) : t).replace(/<[^>]+>/g, ' ').trim().slice(0, 1200)
  }
  return true
}
function addOthers(list) {
  const ok = [...list].filter((f) => f.size <= MAX_BYTES)
  if (ok.length < list.length) toast({ title: '20MB를 넘는 파일은 제외했습니다', tone: 'red' })
  others.value = [...others.value, ...ok].slice(0, 10)
}
const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`)

// 접수 버튼: 입력 확인(check) → 저장(action, 버튼이 원으로 접혀 돈다) → 완료 모습을 보인 뒤 케이스 화면으로(done)
const submitBtn = ref(null)
const created = ref(null)
function checkForm() {
  tried.value = true
  serverError.value = ''
  if (valid.value) return true
  toast({ title: '빠진 항목을 채워 주세요', tone: 'red' })
  return false
}
async function save() {
  saving.value = true
  try {
    const fd = new FormData()
    for (const [k, v] of Object.entries(form)) if (String(v).trim()) fd.append(k, String(v).trim())
    fd.append('raw_file', rawFile.value)
    for (const f of others.value) fd.append('attachments', f)
    created.value = await api('/intake', { method: 'POST', body: fd })
    return true
  } catch (e) {
    serverError.value = e.message
    return false
  } finally {
    saving.value = false
  }
}
function afterSaved() {
  toast({ title: `${created.value.rma_id} 접수했습니다`, tone: 'green' })
  router.push(`/rmas/${created.value.rma_id}/case`)
}
const submit = () => submitBtn.value?.run()

const OUTPUTS = [
  { k: '증상 분류', d: '원문에서 소분류와 근거 문장' },
  { k: 'QA 판정', d: '심각도·분석 수준(L1~L3)' },
  { k: 'Lot 이력·이상 신호', d: '공정·설비·검사·자재' },
  { k: '영향 후보 Lot', d: '같은 설비·자재를 쓴 Lot' },
  { k: '원인 후보', d: '과거 확정 사례 대조, 근거' },
  { k: '재발 판정', d: '조치 이후 생산 여부' },
  { k: '회신 초안·처리방안', d: '고객 안내 문구, 처리 제안' },
]

const field = 'grid gap-1.5'
const labelCls = 'text-[13px] font-semibold text-[#3b404a]'
const hintCls = 'text-xs text-muted-foreground'
const errCls = 'text-xs text-destructive'
const reqCls = 'ml-0.5 text-sk-orange'
const optCls = 'font-normal text-muted-foreground'
</script>

<template>
  <PageHead :crumb="false" title="반품 접수" description="DB에 꼭 필요한 정보는 폼으로, 고객이 보낸 내용은 원문 파일로 받습니다. 접수하면 분류부터 원인분석까지 자동으로 진행됩니다." />

  <div v-if="!meta" class="grid grid-cols-12 gap-4">
    <Skeleton class="col-span-12 h-[620px] rounded-[14px] lg:col-span-8" />
    <Skeleton class="col-span-12 h-[420px] rounded-[14px] lg:col-span-4" />
  </div>

  <form v-else class="grid grid-cols-12 items-start gap-4" novalidate @submit.prevent="submit">
    <Card class="col-span-12 lg:col-span-8" :padded="false">
      <fieldset class="border-b px-6 pb-6 pt-5">
        <legend class="sr-only">고객 및 제품</legend>
        <h2 class="mb-4 text-[15px] font-bold">고객 및 제품</h2>
        <div class="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <div :class="field">
            <label :class="labelCls" for="f-customer">고객사<span :class="reqCls" title="필수 입력">*</span></label>
            <Select id="f-customer" v-model="form.customer_id" placeholder="선택" :options="customerOptions" class="w-full" />
            <p v-if="err('customer_id')" :class="errCls">{{ err('customer_id') }}</p>
          </div>
          <div :class="field">
            <label :class="labelCls" for="f-part">제품 P/N<span :class="reqCls" title="필수 입력">*</span></label>
            <Select id="f-part" v-model="form.reported_part_no" placeholder="선택" :options="productOptions" class="w-full" />
            <p v-if="err('reported_part_no')" :class="errCls">{{ err('reported_part_no') }}</p>
          </div>
          <div :class="field">
            <label :class="labelCls" for="f-occ">발생일<span :class="reqCls" title="필수 입력">*</span></label>
            <Input id="f-occ" v-model="form.occurred_at" type="date" :max="today" class="tabular" :invalid="!!err('occurred_at')" />
            <p v-if="err('occurred_at')" :class="errCls">{{ err('occurred_at') }}</p>
          </div>
          <div :class="field">
            <label :class="labelCls" for="f-stage">발견 단계<span :class="reqCls" title="필수 입력">*</span></label>
            <Select id="f-stage" v-model="form.detection_stage" placeholder="선택" :options="stageOptions" class="w-full" />
            <p v-if="err('detection_stage')" :class="errCls">{{ err('detection_stage') }}</p>
          </div>
        </div>
      </fieldset>

      <fieldset class="border-b px-6 pb-6 pt-5">
        <legend class="sr-only">수량 및 추적 정보</legend>
        <h2 class="mb-4 text-[15px] font-bold">수량 및 추적 정보</h2>
        <div class="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <div :class="field">
            <label :class="labelCls" for="f-defect">신고 불량 수량<span :class="reqCls" title="필수 입력">*</span></label>
            <Input id="f-defect" v-model="form.claimed_defect_qty" type="number" min="1" inputmode="numeric" class="tabular" :invalid="!!err('claimed_defect_qty')" />
            <p v-if="err('claimed_defect_qty')" :class="errCls">{{ err('claimed_defect_qty') }}</p>
          </div>
          <div :class="field">
            <label :class="labelCls" for="f-input">투입 수량<span :class="reqCls" title="필수 입력">*</span></label>
            <Input id="f-input" v-model="form.input_qty" type="number" min="1" inputmode="numeric" class="tabular" :invalid="!!err('input_qty')" />
            <p v-if="err('input_qty')" :class="errCls">{{ err('input_qty') }}</p>
          </div>
          <div :class="field">
            <label :class="labelCls" for="f-lot">Lot 번호 <span :class="optCls">(선택)</span></label>
            <Input id="f-lot" v-model="form.reported_lot_no" placeholder="예: LT-01603" spellcheck="false" autocomplete="off" />
          </div>
          <div :class="field">
            <label :class="labelCls" for="f-dc">D/C <span :class="optCls">(선택)</span></label>
            <Input id="f-dc" v-model="form.reported_date_code" placeholder="예: 2543" inputmode="numeric" class="tabular" />
          </div>
          <!-- 고객 요청 선택지(최대 '선별 지원·대금 공제')가 한 줄에 들어가도록 넓은 화면에서 3칸을 준다 -->
          <div :class="field" class="col-span-2 sm:col-span-1">
            <label :class="labelCls" for="f-panel">패널 식별자 <span :class="optCls">(선택)</span></label>
            <Input id="f-panel" v-model="form.panel_id" spellcheck="false" autocomplete="off" />
          </div>
          <div :class="field" class="col-span-2 sm:col-span-3">
            <span :class="labelCls" id="l-req">고객 요청 <span :class="optCls">(선택)</span></span>
            <div v-slide-pill="'seg-pill'" role="radiogroup" aria-labelledby="l-req" class="seg h-9">
              <label
                v-for="o in ['', ...meta.customer_requests]" :key="o || 'none'"
                class="seg-item flex flex-auto cursor-pointer items-center justify-center whitespace-nowrap px-2 text-[12px] font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
              >
                <input v-model="form.customer_request" type="radio" name="request" :value="o" class="sr-only" />{{ o || '미정' }}
              </label>
            </div>
          </div>
        </div>
        <p :class="hintCls" class="mt-3">Lot을 적으면 생산 기록과 대조합니다. 맞는 Lot이어야 에이전트가 공정·검사 이력을 따라갈 수 있습니다.</p>
      </fieldset>

      <fieldset class="px-6 pb-6 pt-5">
        <legend class="sr-only">고객 원문</legend>
        <div class="mb-1 flex items-end justify-between">
          <h2 class="text-[15px] font-bold">고객 원문<span :class="reqCls" title="필수 입력">*</span></h2>
          <span :class="hintCls">.eml · .txt · .pdf, 20MB 이하</span>
        </div>
        <p :class="hintCls" class="mb-3">고객이 보낸 메일·통보문 파일을 그대로 올립니다. 요약해서 옮겨 적지 않습니다. 증상 분류의 근거가 됩니다.</p>

        <!-- 끌어다 놓으면 동그라미가 삼키고 고리가 찬 뒤 초록 체크 (FileDrop) → 미리보기로 바뀐다 -->
        <FileDrop
          v-if="!rawShown"
          accept=".eml,.txt,.pdf"
          :check="setRaw"
          :error="!!err('raw_file')"
          title="원문 파일을 끌어다 놓거나 눌러서 고르세요"
          hint="고객 메일(.eml) 권장"
          @finished="rawShown = true"
        />
        <div v-else-if="rawFile" class="rounded-lg border bg-muted/40">
          <div class="flex items-center gap-2 border-b px-3 py-2.5">
            <!-- 첨부 완료 표시: 초록 원 + 흰 체크 (FileDrop 완료 모습과 같게) -->
            <span class="grid size-5 shrink-0 place-items-center rounded-full bg-[#1f9d6b] text-white" title="첨부 완료">
              <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
            <span class="sr-only">첨부 완료:</span>
            <span class="truncate text-sm font-semibold">{{ rawFile.name }}</span>
            <span class="shrink-0 text-xs text-muted-foreground tabular">{{ kb(rawFile.size) }}</span>
            <button type="button" class="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground" aria-label="원문 파일 빼기" @click="rawFile = null; rawPreview = ''; rawShown = false"><X class="size-4" /></button>
          </div>
          <p v-if="rawPreview" class="max-h-44 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed">{{ rawPreview }}</p>
          <p v-else class="px-4 py-3 text-xs text-muted-foreground">PDF는 서버가 텍스트를 추출합니다.</p>
        </div>
        <p v-if="err('raw_file')" :class="errCls" class="mt-1.5">{{ err('raw_file') }}</p>

        <div class="mt-5 flex items-center justify-between">
          <span :class="labelCls">기타 첨부 <span :class="optCls">(선택, 사진·고객 시험 결과 등 최대 10개)</span></span>
          <label class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border bg-card px-3 text-xs font-semibold hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50">
            <Paperclip class="size-3.5" />파일 추가
            <input type="file" multiple class="sr-only" @change="addOthers($event.target.files); $event.target.value = ''" />
          </label>
        </div>
        <ul v-if="others.length" class="mt-2 flex flex-wrap gap-2">
          <li v-for="(f, i) in others" :key="f.name + i" class="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs">
            <span class="max-w-[220px] truncate font-medium">{{ f.name }}</span>
            <span class="text-muted-foreground tabular">{{ kb(f.size) }}</span>
            <button type="button" class="text-muted-foreground hover:text-foreground" :aria-label="`${f.name} 빼기`" @click="others.splice(i, 1)"><X class="size-3.5" /></button>
          </li>
        </ul>
      </fieldset>
    </Card>

    <aside class="col-span-12 grid gap-4 lg:sticky lg:top-[84px] lg:col-span-4">
      <Card title="접수하면 에이전트가 만드는 것" description="결과는 케이스 화면에서 단계별로 확인합니다">
        <ol class="grid gap-2.5 text-sm">
          <li v-for="o in OUTPUTS" :key="o.k" class="flex items-start gap-2.5">
            <ArrowRight class="mt-0.5 size-4 shrink-0 text-primary" />
            <span><b class="font-semibold">{{ o.k }}</b><span class="block text-xs text-muted-foreground">{{ o.d }}</span></span>
          </li>
        </ol>
      </Card>

      <div class="rounded-[14px] border bg-card p-5">
        <p v-if="serverError" role="alert" class="mb-3 rounded-md bg-[#fff0f3] px-3 py-2 text-sm text-[#b4122f]">{{ serverError }}</p>
        <SubmitButton ref="submitBtn" block size="lg" :check="checkForm" :action="save" success-label="접수 완료" @done="afterSaved"><Send class="size-4" />접수하고 분석 시작</SubmitButton>
        <p class="mt-2.5 text-center text-xs text-muted-foreground">분석이 실패해도 접수는 저장됩니다.</p>
        <p v-if="MOCK" class="mt-1 text-center text-xs text-sk-orange">목업 모드: 원문에 "정보 부족" 또는 "임시 판정"을 넣으면 예외 흐름을 볼 수 있습니다.</p>
      </div>
    </aside>
  </form>
</template>
