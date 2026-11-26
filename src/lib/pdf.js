// 화면의 요소를 그대로 A4 PDF로 저장한다 (html2pdf.js = html2canvas + jsPDF).
// html2canvas는 Tailwind v4가 쓰는 oklch()·color-mix() 색을 읽지 못하므로, 캡처용 복제본의 색을
// 브라우저가 계산한 rgb 값으로 바꿔 넣는다. data-pdf-ignore가 붙은 요소(버튼 등)는 PDF에서 뺀다.

const COLOR_PROPS = [
  'color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color',
  'border-left-color', 'outline-color', 'text-decoration-color', 'fill', 'stroke',
]
const MODERN = /oklch|oklab|color-mix|lab\(|lch\(/

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

// PDF 캡처 전 화면 글꼴(Pretendard 등)과 본문 내 이미지(CAD 정적 이미지 포함) 로드를 기다린다.
async function waitAssetsReady(el) {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* ignore font readiness errors */
    }
  }
  const imgs = Array.from(el?.querySelectorAll?.('img') || [])
  await Promise.all(
    imgs.map(async (img) => {
      if (!img.complete) {
        await new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true })
          img.addEventListener('error', resolve, { once: true })
        })
      }
      if (typeof img.decode === 'function') {
        try {
          await img.decode()
        } catch {
          /* ignore decode errors */
        }
      }
    }),
  )
}

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
        useCORS: true,
        ignoreElements: (node) => node.hasAttribute?.('data-pdf-ignore'),
        onclone: (doc) => flattenColors(doc),
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['section', 'li', 'tr', '.pdf-keep'] },
    })
    .from(el)
}

export async function saveElementAsPdf(el, filename) {
  await waitAssetsReady(el)
  const html2pdf = await loadHtml2pdf()
  await configure(html2pdf, el, filename).save()
}

export async function elementToPdfBlob(el) {
  await waitAssetsReady(el)
  const html2pdf = await loadHtml2pdf()
  return configure(html2pdf, el, 'report.pdf').outputPdf('blob')
}
