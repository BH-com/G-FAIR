# FINDER 전시장 길찾기

## 화면
- `index.html`: 일반 사용자용 길찾기 화면
- `admin.html`: 관리자용 배치도·기업·부스·경로·지점 관리 화면

## JavaScript 로딩 순서
HTML의 스크립트 순서는 의존성 순서이므로 임의로 바꾸지 않습니다.

1. 공통 유틸리티·설정·저장소
2. 프로젝트 저장·불러오기
3. 지도 뷰포트와 엑셀 파서
4. 애플리케이션 공통 상태
5. 경로 시스템
6. 부스 시스템
7. 목적지 검색
8. 지점 관리
9. 길찾기 엔진
10. 엑셀 등록 관리
11. 앱 초기화
12. 관리자 벡터 경로 편집기

## 주요 기능 모듈
- `js/data/import-manager.js`: 전시장 배치 엑셀 및 참가기업 엑셀 등록
- `js/booths/booth-system.js`: 부스 표시와 관리자 부스 편집
- `js/routing/route-system.js`: 자동 경로 생성, 경로 그래프 및 기존 경로 편집 호환
- `js/routing/vector-route-editor.js`: 관리자 벡터 경로 편집 화면
- `js/navigation/navigation-engine.js`: 최단 경로 계산과 경로 표시
- `js/navigation/destination-search.js`: 기업·부스·제품 검색과 목적지 선택
- `js/locations/location-manager.js`: QR·현재 위치 지점 관리
- `js/project/project-io.js`: 프로젝트 JSON 파일 입출력
- `js/data/project-state.js`: 프로젝트 데이터 수집·검증·복원
- `app.js`: 초기화 순서만 담당

## 배포 데이터
`data/deployment-state.json`은 배포 기준 프로젝트 JSON입니다. 현재는 관리자가 직접 프로젝트 파일을 교체해 배포합니다.

## 삭제한 파일
- `js/routing_joint_tmp.js`: 미사용 placeholder
- `data/route-nodes.json`, `data/route-edges.json`: 현재 HTML과 JavaScript에서 참조하지 않는 구형 샘플

## 수정 시 주의사항
- 저장 키 이름은 기존 프로젝트 파일 호환을 위해 유지합니다.
- `exhibitionJointVectorRouteV1` 키 이름도 이전 파일 호환을 위해 유지합니다.
- 경로 자동 생성 코드와 벡터 편집 코드는 이름이 비슷해도 역할이 다르므로 호출 관계 확인 없이 삭제하지 않습니다.
