# diary-ui

diary-ui는 기록 기반 자기관리 웹 애플리케이션의 프론트엔드 저장소입니다.

사용자는 일기, Todo, 통계 화면을 통해 자신의 기록을 관리하고, 백엔드 API인 `diary-api`와 통신하여 데이터를 조회하거나 저장합니다.

## 관련 저장소

- 백엔드 API: [diary-api](https://github.com/qlqb/diary-api)
- 제품 기획 문서: [diary-api/docs/product](https://github.com/qlqb/diary-api/tree/main/docs/product)
- API 명세: [diary-api/docs/api-spec.md](https://github.com/qlqb/diary-api/blob/main/docs/api-spec.md)
- OpenAPI 파일: [diary-api/docs/openapi.yaml](https://github.com/qlqb/diary-api/blob/main/docs/openapi.yaml)

## 주요 기능

- 회원가입 / 로그인 화면
- JWT 기반 인증 API 연동
- 일기 목록 조회
- 일기 작성 / 수정
- 일기 통계 화면
- Todo 및 하루 계획 기능 확장 예정

## 기술 스택

- React
- Vite
- Tailwind CSS
- lucide-react
- JavaScript

## 실행 전 준비

백엔드 API 서버인 `diary-api`가 먼저 실행되어 있어야 합니다.

기본 API 주소는 다음과 같습니다.

```text
http://localhost:8080/api