// 에이전트 패널 ↔ 서버 연결부.
// 지금은 기존 FastAPI 엔드포인트를 쓴다. 오케스트레이터 API가 정해지면 이 파일만 바꾸면 된다.
// 역할별 정보 제한은 서버가 한다: 같은 RMA라도 CS 토큰이면 원인·설비가 빠진 응답이 온다.
import { api } from './api'

// 유사 사례: [{ rma_id, reasons[], action, result, claim_date, root_cause? }]
export async function fetchSimilar(rmaId) {
  const res = await api(`/rmas/${rmaId}/similar`)
  return (res.items || []).map((s) => ({
    rma_id: s.rma_id,
    claim_date: s.claim_date,
    reasons: (s.basis || '').split('+').filter(Boolean),
    action: s.past_action,
    result: s.result,
    root_cause: s.root_cause ?? null, // CS 응답에는 없음
  }))
}

// 분석 결과: 서버가 역할에 맞춰 내려준 상세(view: 'cs' | 'quality')를 패널 요약으로 바꾼다
export async function fetchAnalysis(rmaId) {
  const r = await api(`/rmas/${rmaId}`)
  if (r.view === 'quality') {
    const approvals = r.approval_pending ? ['Major(L3) 원인·조치 승인'] : []
    return {
      view: 'quality',
      status: r.claim_status,
      rows: [
        ['분석 수준', r.analysis_level || '판정 전'],
        ['원인', r.root_cause ? `${r.root_cause}${r.root_cause_confirmed ? ' (확정)' : ' (추정)'}` : '분석 중'],
        ['공정·설비', [r.process_id, r.equipment_id].filter(Boolean).join(' · ') || '—'],
        ['Lot', r.lot_number || '—'],
        ['재발', r.recurrence_flag ? r.recurrence_decision || '재발 의심' : '없음'],
      ],
      approvals,
    }
  }
  return {
    view: 'cs',
    status: r.claim_status,
    rows: [
      ['응대 상태', r.completed ? '처리 완료' : `진행 중 · 경과 ${r.elapsed_days}일`],
      ['회신 기한', r.reply_due || '—'],
      ['고객 처리', r.disposition || '결정 전'],
      ['담당자', r.handler_name || '—'],
    ],
    history: (r.timeline || []).slice(-3).reverse().map((e) => `${e.stage || ''} ${e.method || ''}`.trim()),
    approvals: [],
  }
}

// 접수 후 진행 상태: 접수 API 응답 + 현재 처리 상태
export async function fetchProgress(intakeRes) {
  let status = null
  try {
    status = (await api(`/rmas/${intakeRes.rma_id}`)).claim_status
  } catch {
    /* 상태 조회 실패는 단계 표시만 비운다 */
  }
  return [
    { label: '접수 저장', desc: intakeRes.rma_id, state: 'done' },
    {
      label: '소분류 자동 분류',
      desc: intakeRes.subtype ? `${intakeRes.subtype} · ${intakeRes.status}` : intakeRes.status,
      state: intakeRes.subtype ? 'done' : 'hold',
    },
    { label: '품질 분석', desc: status ? `현재 상태: ${status}` : '상태를 불러오지 못했습니다', state: status === '처리완료' || status === '원인확정' ? 'done' : 'run' },
    { label: '고객 처리 결정', desc: '품질 분석 결과를 받은 뒤 진행', state: status === '처리완료' ? 'done' : 'wait' },
  ]
}
