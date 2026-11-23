// Spring 연결 전 화면 개발용 목업 (Spring_API_v5 기준).
// VITE_API_MOCK=1 일 때만 쓰인다. 데이터는 PCB v5와 effect-ai samples(실제 에이전트 출력)에서 가져왔다.
import meta from './data/meta.json'
import lots from './data/lots.json'
import s08927 from './data/RMA-08927.json'
import s08218 from './data/RMA-08218.json'
import s07936 from './data/RMA-07936.json'

const KEY = 'rma.mock.v4.2' // 샘플 갱신 시 올려서 이전 목업 저장분을 버린다
const NOW = '2025-12-31T09:00:00+09:00' // 시연 기준 시각 (Spring app.clock.fixed와 같게)
const STEPS = ['ORCHESTRATOR', 'QA', 'MANUFACTURING', 'CAUSE_ANALYSIS', 'QA', 'MANUFACTURING', 'CS']
const RUN_MS = 7000

export class MockError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const clone = (x) => JSON.parse(JSON.stringify(x))
const stamp = (offsetSec = 0) => {
  const d = new Date(Date.parse(NOW) + offsetSec * 1000 + (Date.now() % 3600000))
  return d.toISOString().replace('Z', '').slice(0, 19) + '+09:00'
}

// 처리방안 제안은 effect-ai 출력(drafts.service_action) 그대로. 수량만 이 접수의 신고 불량 수량으로 맞춘다.
// 원문에 "처리 기록 없음"이 있으면 과거 처리 기록이 없는 경우(null)를 흉내 낸다
function withServiceAction(result, claim, noHistory = false) {
  const r = clone(result)
  r.drafts = r.drafts || {}
  const sa = r.drafts.service_action
  if (noHistory || !sa) r.drafts.service_action = null
  else sa.board_qty = sa.action_type === 'NO_CHARGE_SAMPLE_RETURN' ? 0 : claim.claimed_defect_qty
  return r
}

function seed() {
  const claims = {}
  const analyses = {}
  for (const [i, s] of [s08927, s08218].entries()) {
    const c = s.claim
    const sa = s.analysis
    claims[c.rma_id] = {
      ...c,
      occurred_at: c.occurred_at || c.opened_at,
      reported_date_code: c.reported_date_code || null,
      panel_id: null,
      cs_status: 'OPEN',
      qa_status: 'ANALYZING',
      intake_state: 'ACCEPTED',
      customer_request: null,
      symptom: symptomFrom(s.classify),
      triage: triageFrom(sa.result.qa_review, 'QA_AGENT'),
      triage_proposal: null,
      follow_up_questions: [],
      attachments: [{ attachment_id: i + 1, kind: 'RAW', file_name: `${c.rma_id}_고객통보.eml`, content_type: 'message/rfc822', size: c.raw_text.length * 3, uploaded_at: c.opened_at }],
      created_at_ms: 0,
    }
    const id = `ana-${c.rma_id.slice(4)}-sample`
    analyses[c.rma_id] = { analysis_id: id, mode: 'B', as_of: sa.as_of, started_ms: 0, result: withServiceAction(sa.result, c), trace: sa.trace, warnings: sa.warnings || [] }
  }
  return { seq: 10610, attach: 10, claims, analyses, decisions: {}, comms: {}, actions: {} }
}

let db = load()
function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY))
    if (x?.claims) return x
  } catch {
    /* 새로 만든다 */
  }
  return seed()
}
const save = () => localStorage.setItem(KEY, JSON.stringify(db))
export function resetMock() {
  db = seed()
  save()
}

function symptomFrom(cls) {
  return {
    primary_label: cls.minor_code,
    minor_name: cls.minor_name,
    major_name: cls.major_name,
    status: cls.status,
    evidence_spans: cls.evidence_spans || [],
  }
}
function triageFrom(qa, by, extra = {}) {
  return {
    severity: qa.severity,
    characteristic_symbol: qa.characteristic_symbol ?? null,
    analysis_level: qa.analysis_level,
    needs_approval: qa.analysis_level === 'L3',
    approval_reasons: qa.approval_reasons || [],
    rationale: qa.rationale || (qa.approval_reasons || []).join(', ') || `분석 수준 ${qa.analysis_level}`,
    decided_by: by,
    decided_at: stamp(),
    provisional: false,
    ...extra,
  }
}

function role() {
  try {
    return JSON.parse(localStorage.getItem('rma.user'))?.role
  } catch {
    return null
  }
}
function need(...roles) {
  if (!roles.includes(role())) throw new MockError(403, '이 메뉴에 접근할 권한이 없습니다.')
}
function claimOf(id) {
  const c = db.claims[id]
  if (!c) throw new MockError(404, 'RMA를 찾을 수 없습니다.')
  return c
}

// 분석 진행: 시작 후 0.8초 대기, 7초 동안 7단계, 이후 완료
function analysisView(rmaId) {
  const a = db.analyses[rmaId]
  const base = { rma_id: rmaId, analysis_id: null, analysis_state: 'NOT_REQUESTED', as_of: null, mode: null, progress: null, result: null, trace: null, warnings: [], error: null, updated_at: stamp() }
  if (!a) return base
  const el = a.started_ms ? Date.now() - a.started_ms : RUN_MS + 1
  const out = { ...base, analysis_id: a.analysis_id, mode: a.mode }
  if (el < 800) return { ...out, analysis_state: 'QUEUED' }
  if (el < RUN_MS) {
    const done = Math.min(6, Math.floor(((el - 800) / (RUN_MS - 800)) * 7))
    return { ...out, analysis_state: 'RUNNING', progress: { current_agent: STEPS[done], steps_done: done, steps_total: 7 } }
  }
  const full = { ...out, analysis_state: 'SUCCEEDED', as_of: a.as_of, result: a.result, trace: a.trace, warnings: a.warnings }
  if (role() !== 'CS') return full
  const r = a.result
  return {
    ...out,
    analysis_state: 'SUCCEEDED',
    as_of: a.as_of,
    result: {
      classification: r.classification,
      qa_review: { analysis_level: r.qa_review?.analysis_level, needs_approval: r.qa_review?.needs_approval },
      drafts: { customer_reply: r.drafts?.customer_reply, service_action: r.drafts?.service_action },
    },
  }
}

function approvalOf(rmaId) {
  const c = db.claims[rmaId]
  const d = db.decisions[rmaId]
  if (d) return d.approval_status
  if (analysisView(rmaId).analysis_state === 'SUCCEEDED') return 'WAITING'
  return c?.triage ? 'NOT_REQUIRED' : 'NOT_REQUIRED'
}

function detailView(id) {
  const c = claimOf(id)
  const cust = meta.customers.find((x) => x.customer_id === c.customer_id) || {}
  const cs = role() === 'CS'
  const item = { rma_item_id: `ITEM-${id.slice(4)}`, panel_id: c.panel_id, input_qty: c.input_qty, claimed_defect_qty: c.claimed_defect_qty, returned_qty: 0, verified_defect_qty: null }
  if (!cs) item.lot_id = c.reported_lot_no || null
  const out = {
    rma_id: id,
    opened_at: c.opened_at,
    occurred_at: c.occurred_at,
    raw_text: c.raw_text,
    reported_part_no: c.reported_part_no,
    reported_lot_no: c.reported_lot_no,
    reported_date_code: c.reported_date_code,
    detection_stage: c.detection_stage,
    cs_status: c.cs_status,
    customer: { customer_id: c.customer_id, customer_name: cust.customer_name || c.customer_name, industry: cust.industry || c.industry },
    customer_request: c.customer_request,
    items: [item],
    symptom: c.symptom,
    triage: c.triage ? (cs ? { analysis_level: c.triage.analysis_level } : c.triage) : null,
    triage_proposal: cs ? null : c.triage_proposal,
    follow_up_questions: c.follow_up_questions,
    intake_state: c.intake_state,
    analysis_state: analysisView(id).analysis_state,
  }
  if (c.intake_state === 'FAILED') out.error = c.error || { code: 'AI_UNAVAILABLE', detail: 'AI 서버에 연결하지 못했습니다' }
  if (!cs) {
    out.qa_status = c.qa_status
    out.approval_status = approvalOf(id)
  }
  return out
}

function startAnalysis(id) {
  const c = claimOf(id)
  const tpl = s08927.analysis
  const n = id.slice(4)
  const result = withServiceAction(tpl.result, c, /처리\s*기록\s*없음/.test(c.raw_text || ''))
  result.qa_review = { ...result.qa_review, analysis_level: c.triage.analysis_level, needs_approval: c.triage.analysis_level === 'L3' }
  db.analyses[id] = { analysis_id: `ana-20251231-${n}-${Math.random().toString(16).slice(2, 8)}`, mode: 'B', as_of: c.opened_at, started_ms: Date.now(), result, trace: tpl.trace, warnings: tpl.warnings || [] }
  c.qa_status = 'ANALYZING'
  delete db.decisions[id]
}

async function readText(file) {
  if (!file) return ''
  if (/\.pdf$/i.test(file.name)) return '' // 목업은 PDF 텍스트 추출을 하지 않는다 (Spring이 처리)
  const t = await file.text()
  if (/\.eml$/i.test(file.name)) {
    const i = t.search(/\r?\n\r?\n/) // 헤더 다음 본문
    return (i > 0 ? t.slice(i) : t).replace(/<[^>]+>/g, ' ').trim()
  }
  return t.trim()
}

async function intake(fd) {
  need('CS')
  const f = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string'))
  const raw = fd.get('raw_file')
  const req = ['customer_id', 'reported_part_no', 'occurred_at', 'detection_stage', 'claimed_defect_qty', 'input_qty']
  if (req.some((k) => !f[k]) || !raw) throw new MockError(400, '입력값을 확인해 주세요.')
  if (Number(f.input_qty) < Number(f.claimed_defect_qty)) throw new MockError(400, '투입 수량은 신고 불량 수량 이상이어야 합니다.')
  if (f.reported_lot_no && !(lots[f.reported_part_no] || []).includes(f.reported_lot_no.trim().toUpperCase())) {
    throw new MockError(400, `Lot ${f.reported_lot_no}은(는) ${f.reported_part_no}의 생산 기록에 없습니다.`)
  }
  const text = await readText(raw)
  if (!text) throw new MockError(400, '원문 파일에서 텍스트를 읽지 못했습니다. .txt 또는 .eml 파일로 다시 첨부해 주세요.')

  db.seq += 1
  const id = `RMA-${String(db.seq).padStart(5, '0')}`
  const cust = meta.customers.find((x) => x.customer_id === f.customer_id)
  const others = fd.getAll('attachments').filter((x) => x && x.name)
  const attachments = [raw, ...others].map((file, i) => ({
    attachment_id: ++db.attach, kind: i === 0 ? 'RAW' : 'OTHER', file_name: file.name, content_type: file.type || 'application/octet-stream', size: file.size, uploaded_at: stamp(),
  }))
  const c = {
    rma_id: id, customer_id: f.customer_id, customer_name: cust?.customer_name, industry: cust?.industry,
    opened_at: stamp(), occurred_at: `${f.occurred_at}T00:00:00+09:00`, raw_text: text,
    reported_part_no: f.reported_part_no, reported_lot_no: f.reported_lot_no?.trim().toUpperCase() || null,
    reported_date_code: f.reported_date_code || null, panel_id: f.panel_id || null, detection_stage: f.detection_stage,
    input_qty: Number(f.input_qty), claimed_defect_qty: Number(f.claimed_defect_qty), customer_request: f.customer_request || null,
    cs_status: 'OPEN', qa_status: 'RECEIVED', intake_state: 'PROCESSING', symptom: null, triage: null, triage_proposal: null,
    follow_up_questions: [], attachments, created_at_ms: Date.now(),
  }
  db.claims[id] = c

  // 4-3: 분류 → QA 판정 → 원인분석 자동 시작. 테스트 문구로 예외 흐름 확인
  if (/AI\s*장애/.test(text)) {
    c.intake_state = 'FAILED'
    c.error = { code: 'AI_UNAVAILABLE', detail: 'AI 서버에 연결하지 못했습니다 (목업 테스트 문구)' }
  } else if (/정보\s*부족|외관\s*NG/.test(text)) {
    c.symptom = symptomFrom(s07936.classify)
    c.follow_up_questions = s07936.classify.follow_up_questions || []
    c.intake_state = 'NEEDS_INFO'
  } else {
    c.symptom = symptomFrom(s08927.classify)
    const qa = s08927.analysis.result.qa_review
    if (/임시\s*판정/.test(text)) {
      c.triage_proposal = triageFrom({ ...qa, analysis_level: 'L2', approval_reasons: [] }, 'QA_AGENT', { provisional: true, rationale: '접수 증상 미확정 → 임시 L2. 차량 고객이면 당일 QA 확인' })
      c.intake_state = 'TRIAGE_REVIEW'
    } else {
      c.triage = triageFrom(qa, 'QA_AGENT')
      c.qa_status = 'TRIAGED'
      c.intake_state = 'ACCEPTED'
      startAnalysis(id)
    }
  }
  save()
  const a = analysisView(id)
  return {
    rma_id: id, intake_state: c.intake_state, cs_status: c.cs_status, qa_status: c.qa_status,
    symptom: c.symptom, triage: c.triage || c.triage_proposal, follow_up_questions: c.follow_up_questions,
    analysis: a.analysis_id ? { analysis_id: a.analysis_id, analysis_state: a.analysis_state } : null,
    attachments: c.attachments,
  }
}

function putTriage(id, body) {
  need('QUALITY')
  const c = claimOf(id)
  if (db.decisions[id] && db.decisions[id].approval_status !== 'REJECTED') throw new MockError(409, '원인 판정이 끝난 건은 QA 판정을 바꿀 수 없습니다.')
  if (!body.rationale?.trim()) throw new MockError(400, '판정 사유를 입력해 주세요.')
  const before = c.triage || c.triage_proposal
  const rank = { L1: 1, L2: 2, L3: 3 }
  if (before && rank[body.analysis_level] < rank[before.analysis_level] && body.rationale.trim().length < 10) {
    throw new MockError(400, '등급을 낮출 때는 사유를 10자 이상 적어 주세요.')
  }
  const user = JSON.parse(localStorage.getItem('rma.user') || '{}')
  c.triage = { ...(before || {}), ...body, needs_approval: body.analysis_level === 'L3', provisional: false, decided_by: user.name || '품질관리자', decided_at: stamp() }
  c.triage_proposal = null
  if (c.intake_state === 'TRIAGE_REVIEW') {
    c.qa_status = 'TRIAGED'
    c.intake_state = 'ACCEPTED'
    startAnalysis(id)
  }
  save()
  return { rma_id: id, analysis_level: c.triage.analysis_level, qa_status: c.qa_status, intake_state: c.intake_state, decided_by: c.triage.decided_by, decided_at: c.triage.decided_at }
}

function causeDecision(id, body) {
  need('QUALITY')
  const c = claimOf(id)
  const a = analysisView(id)
  if (a.analysis_state !== 'SUCCEEDED' || a.analysis_id !== body.analysis_id) throw new MockError(400, '최신 분석 결과에 대해서만 판정할 수 있습니다.')
  if (db.decisions[id]?.analysis_id === body.analysis_id) throw new MockError(409, '이미 판정한 분석입니다.')
  const level = c.triage?.analysis_level
  const ok = level === 'L3' ? ['APPROVED', 'REJECTED'] : ['CONFIRMED']
  if (!ok.includes(body.decision)) throw new MockError(400, level === 'L3' ? 'L3는 승인 또는 반려만 할 수 있습니다.' : 'L1·L2는 확인으로 판정합니다.')
  const adopted = (body.candidates || []).filter((x) => x.status === 'ADOPTED')
  if (adopted.length > 1) throw new MockError(400, '채택할 원인은 하나만 고를 수 있습니다.')
  if (body.decision !== 'REJECTED' && adopted.length !== 1) throw new MockError(400, '확정할 원인 하나를 채택해 주세요.')
  const user = JSON.parse(localStorage.getItem('rma.user') || '{}')
  db.decisions[id] = { analysis_id: body.analysis_id, approval_status: body.decision, candidates: body.candidates, comment: body.comment, decided_by: user.name || '품질관리자', decided_at: stamp() }
  if (body.decision !== 'REJECTED') c.qa_status = 'CAUSE_DECIDED'
  save()
  return { rma_id: id, approval_status: body.decision, decided_by: db.decisions[id].decided_by, decided_at: db.decisions[id].decided_at }
}

function approvals(query) {
  need('QUALITY')
  const want = query?.status || 'WAITING'
  const l12 = query?.level === 'L1_L2'
  const levelOk = (lv) => (l12 ? ['L1', 'L2'].includes(lv) : lv === 'L3')
  const items = Object.keys(db.claims)
    .filter((id) => levelOk(db.claims[id].triage?.analysis_level) && approvalOf(id) === want)
    .map((id) => {
      const a = analysisView(id)
      const top = a.result?.cause_candidates?.[0]
      return {
        rma_id: id, analysis_id: a.analysis_id, analysis_level: db.claims[id].triage.analysis_level, approval_reasons: db.claims[id].triage.approval_reasons || [],
        top_cause_code: top?.cause_code, top_cause_name: top?.cause_name, requested_at: db.claims[id].opened_at, approval_status: want,
        customer_name: db.claims[id].customer_name, reported_part_no: db.claims[id].reported_part_no, minor_name: db.claims[id].symptom?.minor_name,
      }
    })
  return { items, total: items.length, page: 1, size: 30 }
}

// GET /api/rmas (Spring RmaListResponse와 같은 필드). 목업은 들고 있는 케이스만 나열한다
const SORT_KEYS = ['rma_id', 'opened_at', 'customer_name', 'reported_part_no', 'detection_stage', 'major_name', 'minor_name',
  'classification_status', 'claimed_defect_qty', 'severity', 'cs_status', 'analysis_level', 'analysis_state']
function listRows(query = {}) {
  const quality = role() === 'QUALITY'
  if (!quality && (query.severity || query.recurrence || /severity/.test(query.sort || ''))) throw new MockError(400, '입력값을 확인해 주세요.')
  const rows = Object.values(db.claims).map((c) => {
    const a = analysisView(c.rma_id)
    return {
      rma_id: c.rma_id, opened_at: c.opened_at, customer_name: c.customer_name, reported_part_no: c.reported_part_no,
      detection_stage: c.detection_stage, major_name: c.symptom?.major_name || null, minor_name: c.symptom?.minor_name || null,
      classification_status: c.symptom ? (c.intake_state === 'NEEDS_INFO' ? 'INSUFFICIENT_INFO' : 'CLASSIFIED') : null,
      claimed_defect_qty: c.claimed_defect_qty ?? c.items?.[0]?.claimed_defect_qty ?? 0,
      severity: c.triage?.severity ?? null, analysis_level: c.triage?.analysis_level || null, cs_status: c.cs_status,
      qa_status: c.qa_status, intake_state: c.intake_state, analysis_state: a.analysis_state, approval_status: approvalOf(c.rma_id),
      recurrence_verdict: a.result?.recurrence_check?.status || null,
    }
  })
  const day = (t) => String(t).slice(0, 10)
  const f = rows.filter((r) =>
    (!query.q || [r.rma_id, r.customer_name, r.reported_part_no, r.major_name, r.minor_name].join(' ').toLowerCase().includes(String(query.q).toLowerCase()))
    && (!query.product || r.reported_part_no === query.product) && (!query.defectType || r.major_name === query.defectType)
    && (!query.classification || r.classification_status === query.classification) && (!query.status || r.cs_status === query.status)
    && (!query.severity || r.severity === Number(query.severity)) && (!query.recurrence || r.recurrence_verdict === query.recurrence)
    && (!query.from || day(r.opened_at) >= query.from) && (!query.to || day(r.opened_at) <= query.to))
  const sorts = String(query.sort || 'opened_at:desc').split(',').map((x) => x.split(':'))
  if (sorts.some(([k]) => !SORT_KEYS.includes(k))) throw new MockError(400, '입력값을 확인해 주세요.')
  f.sort((x, y) => {
    for (const [k, d] of sorts) {
      const c = x[k] == null ? 1 : y[k] == null ? -1 : x[k] < y[k] ? -1 : x[k] > y[k] ? 1 : 0
      if (c) return d === 'asc' ? c : -c
    }
    return 0
  })
  return f.map((r) => (quality ? r : { ...r, severity: null, qa_status: null, approval_status: null, recurrence_verdict: null }))
}
function rmaList(query = {}) {
  const all = listRows(query)
  const page = Number(query.page) || 1
  const size = Number(query.size) || 30
  return { items: all.slice((page - 1) * size, page * size), total: all.length, page, size }
}
function rmaCsv(query = {}) {
  const rows = listRows(query)
  const cols = ['rma_id', 'opened_at', 'customer_name', 'reported_part_no', 'major_name', 'minor_name', 'claimed_defect_qty', 'analysis_level', 'cs_status']
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  return new Blob(['\uFEFF' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')], { type: 'text/csv;charset=utf-8' })
}

function triageReviews() {
  need('QUALITY')
  const items = Object.values(db.claims)
    .filter((c) => c.intake_state === 'TRIAGE_REVIEW')
    .map((c) => ({
      rma_id: c.rma_id, opened_at: c.opened_at, customer_name: c.customer_name, reported_part_no: c.reported_part_no, minor_name: c.symptom?.minor_name,
      proposal: { severity: c.triage_proposal?.severity, analysis_level: c.triage_proposal?.analysis_level, rationale: c.triage_proposal?.rationale },
    }))
  return { items, total: items.length, page: 1, size: 30 }
}

function communicate(id, body) {
  need('CS')
  const c = claimOf(id)
  const t = body.message_text?.trim() || ''
  if (t.length < 10) throw new MockError(400, '회신 내용을 10자 이상 적어 주세요.')
  const user = JSON.parse(localStorage.getItem('rma.user') || '{}')
  const m = { message_id: `MSG-${Date.now().toString(36)}`, audience: 'customer', author_role: 'CS', author_name: user.name || '고객대응관리자', message_text: t, sent_at: stamp(), source: body.source }
  ;(db.comms[id] ||= []).push(m)
  if (c.cs_status === 'OPEN') c.cs_status = 'RESPONDED'
  save()
  return { rma_id: id, message_id: m.message_id, cs_status: c.cs_status, sent_at: m.sent_at }
}

function serviceAction(id, body) {
  need('CS')
  const c = claimOf(id)
  const minQty = body.action_type === 'NO_CHARGE_SAMPLE_RETURN' ? 0 : 1
  if (!(Number(body.board_qty) >= minQty)) throw new MockError(400, minQty ? '처리 수량을 1 이상 입력해 주세요.' : '처리 수량을 0 이상 입력해 주세요.')
  const decided = db.decisions[id] && db.decisions[id].approval_status !== 'REJECTED'
  if (body.result === 'EXECUTED' && c.triage?.analysis_level === 'L3' && !decided) throw new MockError(409, 'L3 건은 원인 판정이 끝난 뒤 처리를 실행할 수 있습니다.')
  const act = { action_id: `SA-${Date.now().toString(36)}`, action_type: body.action_type, board_qty: Number(body.board_qty), result: body.result, decided_at: stamp(), executed_at: body.result === 'EXECUTED' ? stamp() : null }
  ;(db.actions[id] ||= []).push(act)
  if (body.result === 'EXECUTED') c.cs_status = 'CLOSED'
  save()
  return { rma_id: id, ...act, cs_status: c.cs_status }
}

const routes = [
  ['POST', /^\/auth\/login$/, (_, b) => {
    const cs = /cs|고객/i.test(b.username || '')
    return { token: 'mock-token', user: { name: cs ? '고객대응 담당' : '품질 담당', role: cs ? 'CS' : 'QUALITY', role_label: cs ? '고객대응관리자' : '품질관리자' } }
  }],
  ['POST', /^\/auth\/(logout|reissue)$/, () => { throw new MockError(401, '로그인이 필요합니다.') }],
  ['GET', /^\/auth\/me$/, () => JSON.parse(localStorage.getItem('rma.user') || 'null')],
  // Spring GET /api/ai/health와 같은 모양. 시연용 장애 전환(/ai/toggle)은 목업에만 있다
  ['GET', /^\/ai\/health$/, () => ({ available: !db.aiDown, provider: 'mock', status: db.aiDown ? 'down' : 'ok', db: 'ok', llm: 'off' })],
  ['POST', /^\/ai\/toggle$/, (_, b) => { db.aiDown = !b.available; save(); return { available: !db.aiDown } }],
  ['GET', /^\/rmas$/, (_, __, q) => rmaList(q)],
  ['GET', /^\/rmas\/export$/, (_, __, q) => rmaCsv(q)],
  ['GET', /^\/alerts$/, () => ({ items: [], unread: 0, unread_by_type: {}, max_id: 0, starred_count: 0 })],
  ['GET', /^\/meta$/, () => meta],
  ['POST', /^\/intake$/, (_, b) => intake(b)],
  ['GET', /^\/approvals$/, (_, __, q) => approvals(q)],
  ['GET', /^\/triage-reviews$/, () => triageReviews()],
  ['GET', /^\/attachments\/(\d+)$/, (m) => {
    // 공통 응답 예외: 파일 본문. 목업은 원문 텍스트만 갖고 있어 나머지 첨부는 안내 문구로 대신한다
    const id = Number(m[1])
    const c = Object.values(db.claims).find((x) => x.attachments.some((a) => a.attachment_id === id))
    if (!c) throw new MockError(404, '첨부파일을 찾을 수 없습니다.')
    const a = c.attachments.find((x) => x.attachment_id === id)
    const body = a.kind === 'RAW' ? c.raw_text : `목업 모드에서는 첨부파일 본문을 저장하지 않습니다 (${a.file_name})`
    return new Blob([body], { type: 'text/plain;charset=utf-8' })
  }],
  ['GET', /^\/rmas\/([^/]+)$/, (m) => detailView(m[1])],
  ['GET', /^\/rmas\/([^/]+)\/analysis$/, (m) => { claimOf(m[1]); return analysisView(m[1]) }],
  ['POST', /^\/rmas\/([^/]+)\/analysis$/, (m) => { need('QUALITY'); startAnalysis(m[1]); save(); const a = analysisView(m[1]); return { rma_id: m[1], analysis_id: a.analysis_id, analysis_state: a.analysis_state } }],
  ['PUT', /^\/rmas\/([^/]+)\/triage$/, (m, b) => putTriage(m[1], b)],
  ['POST', /^\/rmas\/([^/]+)\/cause-decision$/, (m, b) => causeDecision(m[1], b)],
  ['GET', /^\/rmas\/([^/]+)\/cause-decision$/, (m) => db.decisions[m[1]] || null],
  ['GET', /^\/rmas\/([^/]+)\/communications$/, (m) => ({ items: db.comms[m[1]] || [] })],
  ['POST', /^\/rmas\/([^/]+)\/communications$/, (m, b) => communicate(m[1], b)],
  ['GET', /^\/rmas\/([^/]+)\/service-action$/, (m) => ({ items: db.actions[m[1]] || [] })],
  ['POST', /^\/rmas\/([^/]+)\/service-action$/, (m, b) => serviceAction(m[1], b)],
  ['GET', /^\/rmas\/([^/]+)\/attachments$/, (m) => ({ items: claimOf(m[1]).attachments })],
  ['POST', /^\/rmas\/([^/]+)\/intake\/retry$/, (m) => {
    const c = claimOf(m[1])
    if (c.intake_state !== 'FAILED') throw new MockError(409, '실패한 접수만 다시 처리할 수 있습니다.')
    c.symptom = symptomFrom(s08927.classify)
    c.triage = triageFrom(s08927.analysis.result.qa_review, 'QA_AGENT')
    c.qa_status = 'TRIAGED'
    c.intake_state = 'ACCEPTED'
    c.error = null
    startAnalysis(m[1])
    save()
    return detailView(m[1])
  }],
]

export async function mockApi(path, { method = 'GET', body, query } = {}) {
  await new Promise((r) => setTimeout(r, 150)) // 네트워크 지연 흉내
  for (const [m, re, fn] of routes) {
    const hit = method === m && path.match(re)
    if (hit) return fn(hit, body, query)
  }
  throw new MockError(404, `목업에 없는 API입니다: ${method} ${path}`)
}
