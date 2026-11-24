import { S, animate, settled, snap, step, stop, tune } from './spring'

// v-slide-pill: 탭 묶음에 선택 표시(알약)를 하나 깔고, 선택이 바뀌면 미끄러지게 한다.
// DesignBookmark "Tab Pill"(tab-pill/tabs.js)과 같은 방식: 알약의 양쪽 끝에 스프링을 하나씩 두고,
// 가는 방향 쪽 끝은 단단하게(620 40), 반대쪽 끝은 느슨하게(170 19) 해서 늘어났다가 꼬리를 당겨온다.
// 선택된 항목: [aria-selected="true"] 또는 체크된 input을 품은 label
// 사용: <div v-slide-pill="'seg-pill'"> … </div>  (값 = 알약에 붙일 클래스)

const LEAD = [620, 40]
const TRAIL = [170, 19]

function selected(el) {
  return el.querySelector(':scope > [aria-selected="true"]') || el.querySelector(':scope > label:has(input:checked)')
}

export const vSlidePill = {
  mounted(el, binding) {
    const pill = document.createElement('span')
    pill.dataset.pill = ''
    pill.className = binding.value || 'seg-pill'
    pill.setAttribute('aria-hidden', 'true')
    el.classList.add('has-pill')
    el.prepend(pill)

    const A = S(0) // 왼쪽 끝
    const B = S(0) // 오른쪽 끝
    const Y = S(0, 420, 32) // 줄이 바뀌는 경우(여러 줄 탭)
    const H = S(0, 420, 32)
    let ready = false
    let cur = null

    const comp = {
      frame(dt) {
        step(A, dt)
        step(B, dt)
        step(Y, dt)
        step(H, dt)
      },
      render() {
        pill.style.transform = `translate(${A.x.toFixed(2)}px, ${Y.x.toFixed(2)}px)`
        pill.style.width = `${Math.max(0, B.x - A.x).toFixed(2)}px`
        pill.style.height = `${H.x.toFixed(2)}px`
      },
      idle: () => [A, B, Y, H].every(settled),
    }

    function sync({ jump = false } = {}) {
      const target = selected(el)
      pill.style.opacity = target ? '1' : '0'
      if (!target) return
      // 같은 항목을 다시 알려 온 경우(화면 갱신 훅과 속성 감시가 둘 다 부름): 진행 중인 움직임을 그대로 둔다
      if (ready && !jump && target === cur) return
      const l = target.offsetLeft
      const r = l + target.offsetWidth
      const dir = l >= A.t ? 1 : -1
      A.t = l
      B.t = r
      Y.t = target.offsetTop
      H.t = target.offsetHeight
      // 처음 그릴 때, 크기가 바뀐 경우는 제자리로 바로
      if (!ready || jump) {
        ;[A, B, Y, H].forEach(snap)
        comp.render()
        ready = true
        cur = target
        return
      }
      cur = target
      if (dir > 0) {
        tune(B, ...LEAD)
        tune(A, ...TRAIL)
      } else {
        tune(A, ...LEAD)
        tune(B, ...TRAIL)
      }
      animate(comp)
    }

    const mo = new MutationObserver(() => sync())
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['aria-selected'], childList: true })
    const onChange = () => sync()
    el.addEventListener('change', onChange)
    const ro = new ResizeObserver(() => sync({ jump: true }))
    ro.observe(el)

    el._pill = { pill, mo, ro, onChange, comp, sync }
    sync({ jump: true })
  },
  updated(el) {
    el._pill?.sync()
  },
  unmounted(el) {
    const p = el._pill
    if (!p) return
    p.mo.disconnect()
    p.ro.disconnect()
    el.removeEventListener('change', p.onChange)
    stop(p.comp)
  },
}
