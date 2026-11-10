# E!ffect Frontend

SSD 반품(RMA) 분석 서비스의 웹 화면입니다. 품질관리자와 고객대응관리자가 대시보드, RMA 조회, 반품 접수, 불량 패턴, 재발 관리, AI 보고서를 사용합니다.

## 기술

Vue 3, Vite, Tailwind CSS v4, vue-router, lucide-vue-next, html2pdf.js

## 실행

```bash
npm ci
npm run dev        # http://localhost:5173, /api 요청은 http://127.0.0.1:8000 으로 전달
npm run build      # dist/ 생성
```

## 이미지

```bash
docker build -t effect-frontend .
```

빌드한 정적 파일을 nginx가 80번 포트로 서빙합니다. 화면 경로는 모두 `index.html`로 돌려 새로고침해도 유지됩니다.

## 백엔드 연결

모든 API는 같은 도메인의 `/api` 상대경로로 호출합니다. 서버 주소를 코드에 적지 않으므로, 배포 환경에서는 Ingress가 `/api`를 백엔드로 보내면 됩니다.

- 인증: 로그인 응답의 토큰을 `Authorization: Bearer <token>` 헤더로 보냅니다.
- 401 응답을 받으면 로그인 화면으로 이동합니다.
- 오류 응답은 `{"detail": "<화면에 보여줄 문구>"}` 형식을 기대합니다.
