// 직전 기간 대비 표기
export function deltaPct(v, suffix = '직전 대비') {
  if (v == null) return `${suffix} —`
  if (v === 0) return `${suffix} 변동 없음`
  return `${v > 0 ? '▲' : '▼'} ${Math.abs(v)}% ${suffix}`
}

export function deltaNum(v, unit, suffix = '직전 대비') {
  if (v == null) return `${suffix} —`
  if (v === 0) return `${suffix} 변동 없음`
  return `${v > 0 ? '▲' : '▼'} ${Math.abs(v)}${unit} ${suffix}`
}

// 값이 커지는 게 나쁜 지표(건수·손실)인지 좋은 지표(완료율)인지에 따라 색 결정
export function tone(v, higherIsBad = true) {
  if (!v) return 'muted'
  return (v > 0) === higherIsBad ? 'up-bad' : 'down-good'
}

// KPI 카드 하단용 짧은 증감 (설명 문구는 카드가 따로 붙인다): ↑ 58건 · ↓ 3.2%
export function deltaShort(v, unit = '%') {
  if (v == null) return '' // 비교 불가면 설명 문구만
  if (v === 0) return '변동 없음'
  return `${v > 0 ? '↑' : '↓'} ${Math.abs(v)}${unit}`
}

// KPI 계산식 툴팁의 실제 값 줄: 88 ÷ 128 × 100 = 68.8%
export function rateCalc(k, unit = '%') {
  if (!k?.den) return '분모가 0이라 계산하지 않았습니다'
  const n = (v) => Number(v).toLocaleString()
  return unit === '%' ? `${n(k.num)} ÷ ${n(k.den)} × 100 = ${k.value}%` : `${n(k.num)} ÷ ${n(k.den)} = ${k.value}${unit}`
}
