// 화면의 요소를 그대로 A4 PDF로 저장한다 (html2pdf.js = html2canvas + jsPDF).
// html2canvas는 Tailwind v4의 oklch()·color-mix(), 음수 자간, tabular-nums, 넓은 화면 폭에서
// 줄바꿈·자간·배지가 깨지므로, 캡처 복제본(onclone)에서 A4 폭(704px)과 인쇄용 스타일로 정규화한다.

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

function normalizeForPdf(doc) {
  // 1) A4 인쇄 폭(186mm ≈ 704px)에 맞춘 PDF 전용 스타일 주입
  const style = doc.createElement('style')
  style.textContent = `
    .pdf-root {
      width: 704px !important;
      max-width: 704px !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      background: #ffffff !important;
    }
    .pdf-root, .pdf-root * {
      letter-spacing: 0px !important;
      font-variant-numeric: normal !important;
      word-break: keep-all !important;
      overflow-wrap: break-word !important;
    }
    .pdf-root .pdf-badge {
      display: inline-block !important;
      line-height: 1.35 !important;
      vertical-align: middle !important;
    }
    .pdf-root .pdf-cad-img {
      height: 142px !important;
    }
    .pdf-root .pdf-body {
      padding-top: 16px !important;
      padding-bottom: 4px !important;
    }
  `
  doc.head.appendChild(style)

  // 2) Tailwind v4 oklch/oklab 색을 sRGB rgba로 평탄화
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
      margin: [10, 12, 13, 12],
      filename,
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: {
        scale: 2,
        windowWidth: 760,
        backgroundColor: '#ffffff',
        useCORS: true,
        ignoreElements: (node) => node.hasAttribute?.('data-pdf-ignore'),
        onclone: (doc) => normalizeForPdf(doc),
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      // 큰 section 대신 원자적 블록(.pdf-keep, article, tr, figure)만 분할 방지해 빈 공백·제목 고아 현상 제거
      pagebreak: {
        mode: ['css', 'legacy'],
        before: '.pdf-page-before',
        avoid: ['.pdf-keep', 'article', 'tr', 'figure', 'li'],
      },
    })
    .from(el)
}

function addPageNumbers(pdf) {
  const total = pdf.internal.getNumberOfPages()
  const w = pdf.internal.pageSize.getWidth()
  const h = pdf.internal.pageSize.getHeight()
  pdf.setFontSize(8.5)
  pdf.setTextColor(138, 145, 156)
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    pdf.text(`${i} / ${total}`, w / 2, h - 6.5, { align: 'center' })
  }
}

export async function saveElementAsPdf(el, filename) {
  await waitAssetsReady(el)
  const html2pdf = await loadHtml2pdf()
  const worker = configure(html2pdf, el, filename)
  await worker
    .toPdf()
    .get('pdf')
    .then((pdf) => addPageNumbers(pdf))
    .save()
}

export async function elementToPdfBlob(el) {
  await waitAssetsReady(el)
  const html2pdf = await loadHtml2pdf()
  const worker = configure(html2pdf, el, 'report.pdf')
  return worker
    .toPdf()
    .get('pdf')
    .then((pdf) => addPageNumbers(pdf))
    .outputPdf('blob')
}
