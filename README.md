# diary-ui

diary-ui는 기록 기반 자기관리 웹 애플리케이션의 프론트엔드 저장소입니다.

자료·상담·상태를 바탕으로 AI가 기간 학습 계획 초안을 만들고, 사용자가 확인한 것만 오늘의 실행과 기록으로 이어 갑니다. 백엔드 API인 `diary-api`와 통신합니다.

## 관련 저장소

- 백엔드 API: [diary-api](https://github.com/qlqb/diary-api)
- 제품 기획 문서: [diary-api/docs/product](https://github.com/qlqb/diary-api/tree/main/docs/product)
- API 명세: [diary-api/docs/api-spec.md](https://github.com/qlqb/diary-api/blob/main/docs/api-spec.md)
- OpenAPI 파일: [diary-api/docs/openapi.yaml](https://github.com/qlqb/diary-api/blob/main/docs/openapi.yaml)

## 주요 기능

최상위 탭은 `src/shell/MainShell.jsx`의 여섯 개입니다.

- **오늘**: 오늘의 실행 조각 완료·부분 수행·이동·보류, 과제 마감, 수업 확인
- **자료**: 자료 업로드(PDF·HWP·IPYNB·ZIP·소스 코드 등)와 자동 분석 현황
- **프로젝트**: 프로젝트(과목)별 작업 공간 — 학습 지도·교재 목차·기억하는 것·자료 정리
- **계획**: 기간 학습 계획 초안 미리보기("말한 범위" 패널 포함)·확정·회고
- **일정**: 주간 일정, 시간표(루틴)·일회성 약속
- **기록**: 수행 기록(완료·일부 수행)과 조정 이력. 일기 API 연동 함수는 `api.js`에 남아 있지만 메인 화면에는 일기 탭이 없다
- **AI 상담 패널**: 어느 탭에서나 열리는 상담. 사진 첨부, 일정 이미지 가져오기

회원가입·로그인(JWT)이 먼저 필요합니다.

## 기술 스택

- React
- Vite
- Tailwind CSS
- lucide-react
- JavaScript

## 실행 전 준비

백엔드 API 서버인 `diary-api`가 먼저 실행되어 있어야 합니다.

기본 API 주소는 다음과 같습니다(`src/api/api.js`). 다른 주소를 쓰려면 `VITE_API_BASE_URL`로 덮어씁니다.

```text
http://localhost:8081/api
```

```bash
npm install
npm run dev
npm test
```