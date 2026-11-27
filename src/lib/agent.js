// 에이전트 패널 ↔ Spring 서버 연결부.
// 역할별 정보 제한은 서버가 한다: 같은 RMA라도 CS 토큰이면 원인·설비가 빠진 응답이 온다.
import { api } from './api'

const STATE_LABEL = {
  OPEN: '회신 전',
  RESPONDED: '1차 회신 완료',
  CLOSED: '종료',
  RECEIVED: '접수',
  TRIAGED: 'QA 판정 완료',
  ANALYZING: '분석 중',
  CAUSE_DECIDED: '원인 확정',
  NOT_REQUESTED: '분석 전',
  QUEUED: '분석 대기',
  RUNNING: '분석 중',
  SUCCEEDED: '분석 완료',
  PARTIAL: '분석 완료(일부 생략)',
  FAILED: '분석 실패',
  WAITING: '승인 대기',
  APPROVED: '승인',
  REJECTED: '반려',
  NOT_REQUIRED: '승인 불필요',
}
const fmtState = (v) => (v ? STATE_LABEL[v] || v : '—')

// 유사 사례: [{ rma_id, reasons[], action, result, claim_date, root_cause? }]
export async function fetchSimilar(rmaId) {
  const res = await api(`/rmas/${rmaId}/similar`)
  return (res.items || []).map((s) => ({
    rma_id: s.rma_id,
    claim_date: s.claim_date || (s.opened_at ? String(s.opened_at).slice(0, 10) : ''),
    reasons: (s.basis || '').split('+').map((x) => x.trim()).filter(Boolean),
    action: s.past_action || s.corrective_actions?.[0]?.description || '',
    result: s.recurrence === false ? '재발 없음' : s.recurrence === true ? '재발 이력' : s.days_to_resolve ? `${s.days_to_resolve}일 해결` : '',
    root_cause: s.cause_name ?? s.root_cause ?? null, // CS 응답에는 없음
  }))
}

// 분석 결과: Spring RmaDetailResponse + /rmas/{rmaId}/analysis 결과를 패널 요약 카드로 변환
export async function fetchAnalysis(rmaId, isCs = false) {
  const [r, ana] = await Promise.all([
    api(`/rmas/${rmaId}`),
    api(`/rmas/${rmaId}/analysis`).catch(() => null),
  ])
  const res = ana?.result || {}
  const topCause = res.cause_candidates?.[0]
  const item = r.items?.[0]
  const symptom = r.symptom?.minor_name || res.classification?.minor_name || '미분류'
  const level = r.triage?.analysis_level || res.qa_review?.analysis_level || '판정 전'

  if (!isCs) {
    const approvals = []
    if (r.approval_status === 'WAITING' || res.qa_review?.needs_approval) {
      approvals.push(...(res.qa_review?.approval_reasons || [`${level} 원인·조치 승인 대기`]))
    }
    const causeText = ana?.cause_decision?.adopted_cause_code
      ? `${topCause?.cause_name || ana.cause_decision.adopted_cause_code} (확정)`
      : topCause
        ? `${topCause.cause_name} (${Math.round((topCause.score || 0) * 100)}%, 후보)`
        : fmtState(r.analysis_state)
    const procEquip = [topCause?.process_name || topCause?.process_id, topCause?.equipment_id].filter(Boolean).join(' · ') || '—'
    const lotText = item?.lot_id || res.trace_summary?.lot_id || r.reported_lot_no || '—'
    const rec = r.recurrence_decision || res.recurrence_check?.status || '없음'
    return {
      view: 'quality',
      status: `${fmtState(r.qa_status)} · ${fmtState(r.analysis_state)}`,
      rows: [
        ['제품·증상', `${r.reported_part_no || '—'} · ${symptom}`],
        ['분석 수준', `${level}${r.triage?.severity ? ` (심각도 ${r.triage.severity})` : ''}`],
        ['1순위 원인', causeText],
        ['공정·설비', procEquip],
        ['Lot / 재발', `${lotText} · ${rec}`],
      ],
      approvals,
      history: (topCause?.evidence || []).slice(0, 3).map((e) => e.summary).filter(Boolean),
    }
  }

  const sa = res.drafts?.service_action
  return {
    view: 'cs',
    status: `${fmtState(r.cs_status)} · ${fmtState(r.analysis_state)}`,
    rows: [
      ['고객·제품', `${r.customer?.customer_name || '—'} · ${r.reported_part_no || '—'}`],
      ['증상 분류', symptom],
      ['분석 수준', level],
      ['처리 제안', sa ? `${sa.action_name}${sa.board_qty ? ` (${sa.board_qty}매)` : ''}` : '분석 대기'],
      ['2차 회신', r.follow_up_draft_available ? '작성 가능' : 'QA 확정 대기'],
    ],
    approvals: [],
    history: res.drafts?.customer_reply ? [res.drafts.customer_reply] : [],
  }
}

// 접수 후 진행 상태: 접수 API 응답 + 현재 처리 상태
export async function fetchProgress(intakeRes) {
  let detail = null
  try {
    detail = await api(`/rmas/${intakeRes.rma_id}`)
  } catch {
    /* 상태 조회 실패는 단계 표시만 비운다 */
  }
  const st = detail?.analysis_state || detail?.qa_status || detail?.cs_status
  const done = st === 'SUCCEEDED' || st === 'CAUSE_DECIDED' || st === 'CLOSED'
  return [
    { label: '접수 저장', desc: intakeRes.rma_id, state: 'done' },
    {
      label: '소분류 자동 분류',
      desc: intakeRes.subtype ? `${intakeRes.subtype} · ${intakeRes.status}` : detail?.symptom?.minor_name || intakeRes.status || '완료',
      state: intakeRes.subtype || detail?.symptom?.minor_name ? 'done' : 'hold',
    },
    { label: '품질 분석', desc: st ? `현재 상태: ${fmtState(st)}` : '상태를 불러오지 못했습니다', state: done ? 'done' : 'run' },
    { label: '고객 처리 결정', desc: '품질 분석 결과를 받은 뒤 진행', state: detail?.cs_status === 'CLOSED' ? 'done' : 'wait' },
  ]
}
