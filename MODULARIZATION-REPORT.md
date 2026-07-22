# FINDER 모듈화 결과

## 완료 단계
1. HTML을 관리자·사용자 화면의 실제 표시 순서대로 정렬
2. 프로젝트 JSON 입출력 분리
3. 대형 `app.js`를 기능 흐름별 모듈로 분리
4. 관리자 벡터 경로 편집기 명칭 정리
5. 미사용 placeholder 및 구형 미참조 샘플 삭제
6. 기업정보가 포함된 최신 배포 JSON 반영
7. 정적 무결성 검사기 추가

## 현재 파일별 책임
- `app.js`: 앱 초기화
- `js/core/app-core.js`: 공통 상태, 전시회명, 저장 동기화, 초기 데이터 로딩
- `js/data/import-manager.js`: 배치도·참가기업 엑셀 등록과 원본 복원
- `js/booths/booth-system.js`: 부스 렌더링과 편집
- `js/routing/route-system.js`: 자동 경로 생성과 경로 그래프 호환 계층
- `js/routing/vector-route-editor.js`: 관리자 벡터 경로 편집 UI
- `js/navigation/destination-search.js`: 검색과 목적지 선택
- `js/navigation/navigation-engine.js`: 최단 경로 계산과 경로 출력
- `js/locations/location-manager.js`: QR·현재 위치 지점 관리
- `js/project/project-io.js`: 프로젝트 파일 입출력
- `js/data/project-state.js`: 프로젝트 상태 직렬화·검증·복원

## 호환을 위해 유지한 사항
- 기존 localStorage 키 전체
- 프로젝트 JSON `version: 1`
- `exhibitionJointVectorRouteV1` 저장 키 이름
- 기존 함수 실행 순서
- 기존 관리자 벡터 편집기 로딩 위치

## 삭제한 사항
- `js/routing_joint_tmp.js`
- `data/route-nodes.json`
- `data/route-edges.json`

## 검사 결과
- 자체 JavaScript 전체 구문 검사 통과
- JSON 전체 파싱 통과
- HTML 중복 ID 없음
- HTML 스크립트 경로 누락 없음
- `node verify-project.js` 통과

## 남은 수동 확인
정적 검사만으로 마우스 드래그·파일 선택·SVG 편집의 실제 브라우저 동작까지 완전히 보장할 수는 없습니다. GitHub 업로드 전 관리자 화면에서 배치도 등록, 기업 등록, 부스 편집, 경로 편집, 프로젝트 내보내기·불러오기를 한 차례 확인해야 합니다.
