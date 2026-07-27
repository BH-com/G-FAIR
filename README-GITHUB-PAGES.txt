G-FAIR GitHub Pages + Firebase 사용 안내

이 폴더의 파일은 GitHub 저장소 루트에 그대로 올립니다.
ZIP 파일 자체를 올리지 말고 압축을 푼 뒤 모든 파일과 폴더를 업로드하세요.

GitHub 설정
1. 새 저장소를 만듭니다. Public 저장소가 가장 간단합니다.
2. Add file > Upload files를 누릅니다.
3. 이 폴더 안의 모든 항목을 업로드합니다.
4. Commit changes를 누릅니다.
5. Settings > Pages로 이동합니다.
6. Source: Deploy from a branch
7. Branch: main, Folder: /(root)
8. Save를 누릅니다.

주소 예시
사용자: https://깃허브아이디.github.io/저장소이름/
관리자: https://깃허브아이디.github.io/저장소이름/admin.html

Firebase Authentication 승인 도메인
Firebase 콘솔 > Authentication > Settings > Authorized domains에서
깃허브아이디.github.io 를 추가하세요.

운영 방식
- 부스, 기업정보, 프로그램, 경로 등 관리자 데이터 수정: Firebase에 저장되므로 GitHub 재업로드 불필요
- HTML, CSS, JavaScript 기능 수정: 수정 파일을 GitHub에 덮어쓰고 Commit changes
