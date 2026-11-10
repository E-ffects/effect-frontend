// 화면의 요소를 그대로 A4 PDF로 저장한다 (html2pdf.js = html2canvas + jsPDF).
// html2canvas는 Tailwind v4가 쓰는 oklch()·color-mix() 색을 읽지 못하므로, 캡처용 복제본의 색을
// 브라우저가 계산한 rgb 값으로 바꿔 넣는다. data-pdf-ignore가 붙은 요소(버튼 등)는 PDF에서 뺀다.

const COLOR_PROPS = [
  'color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color',
  'border-left-color', 'outline-color', 'text-decoration-color', 'fill', 'stroke',
]
const MODERN = /oklch|oklab|color-mix|lab\(|lch\(/

// 캔버스에 1픽셀을 칠한 뒤 읽어 sRGB rgba()로 바꾼다 (fillStyle 문자열은 oklab 그대로 남기 때문)
function toRgb(ctx, value) {
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
}

function flattenColors(doc) {
  const canvas = doc.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const win = doc.defaultView
  for (const el of doc.body.querySelectorAll('*')) {
    const cs = win.getComputedStyle(el)
    for (const prop of COLOR_PROPS) {
      const v = cs.getPropertyValue(prop)
      if (v && MODERN.test(v)) el.style.setProperty(prop, toRgb(ctx, v))
    }
    if (MODERN.test(cs.boxShadow)) el.style.boxShadow = 'none'
    if (MODERN.test(cs.backgroundImage)) el.style.backgroundImage = 'none'
  }
}

// html2pdf의 worker는 Promise처럼 동작(thenable)하므로 async 함수에서 그대로 반환하면 풀려 버린다.
// 라이브러리만 비동기로 불러오고, worker 체인은 동기로 만들어 바로 save()/outputPdf()까지 잇는다.
const loadHtml2pdf = () => import('html2pdf.js').then((m) => m.default)

function configure(html2pdf, el, filename) {
  return html2pdf()
    .set({
      margin: [12, 12, 14, 12],
      filename,
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: {
        scale: 2,
        backgroundColor: '#ffffff',
        ignoreElements: (node) => node.hasAttribute?.('data-pdf-ignore'),
        onclone: (doc) => flattenColors(doc),
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['section', 'li'] },
    })
    .from(el)
}

export async function saveElementAsPdf(el, filename) {
  const html2pdf = await loadHtml2pdf()
  await configure(html2pdf, el, filename).save()
}

// 파일로 내려받지 않고 PDF 데이터만 만든다 (미리보기·검사용)
export async function elementToPdfBlob(el) {
  const html2pdf = await loadHtml2pdf()
  return configure(html2pdf, el, 'report.pdf').outputPdf('blob')
}
