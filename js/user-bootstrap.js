(() => {
  const store = window.FINDER_PROJECT_STORE;
  const bridge = window.FINDER_FIREBASE;
  const status = document.getElementById('status');

  function loadApp() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/app.js?v=20260727-badge-scale-tune2';
      script.onload = resolve;
      script.onerror = () => reject(new Error('사용자 화면 프로그램을 불러오지 못했습니다.'));
      document.body.appendChild(script);
    });
  }

  (async () => {
    try {
      if (!bridge?.available) throw bridge?.error || new Error('Firebase 연결 설정이 없습니다.');
      if (status) status.textContent = '최신 전시장 정보를 불러오는 중…';
      const project = await bridge.waitForInitialProject();
      if (project) store.applyRemote(project, { persist: false, origin: 'firebase-initial' });
      await loadApp();
      bridge.subscribeProject(nextProject => {
        store.applyRemote(nextProject, { persist: false, origin: 'firebase-live' });
      });
    } catch (error) {
      console.error(error);
      if (status) status.textContent = 'Firebase 연결 실패 · 기본 데이터로 실행합니다.';
      try { await loadApp(); } catch (appError) { console.error(appError); }
    }
  })();
})();
