(() => {
  const bridge = window.FINDER_FIREBASE;
  const store = window.FINDER_PROJECT_STORE;
  const gate = document.getElementById('firebaseLoginGate');
  const form = document.getElementById('firebaseLoginForm');
  const emailInput = document.getElementById('firebaseLoginEmail');
  const passwordInput = document.getElementById('firebaseLoginPassword');
  const message = document.getElementById('firebaseLoginMessage');
  const adminApp = document.getElementById('adminApp');
  const signOutButton = document.getElementById('firebaseSignOut');
  let adminLoaded = false;
  let booting = false;

  function setMessage(text, type = '') {
    if (!message) return;
    message.textContent = text || '';
    message.dataset.type = type;
  }

  function loadAdminProgram() {
    if (adminLoaded) return Promise.resolve();
    adminLoaded = true;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/admin.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('관리자 프로그램을 불러오지 못했습니다.'));
      document.body.appendChild(script);
    });
  }

  async function unlock(user) {
    if (booting || adminLoaded) return;
    booting = true;
    setMessage('Firebase의 최신 전시장 정보를 불러오는 중입니다…');
    try {
      const project = await bridge.waitForInitialProject(true);
      if (project) store.applyRemote(project, { persist: true, origin: 'firebase-admin-initial' });
      gate.hidden = true;
      adminApp.hidden = false;
      document.body.classList.remove('firebase-auth-pending');
      if (signOutButton) {
        signOutButton.hidden = false;
        signOutButton.title = user.email || '관리자 로그아웃';
      }
      await loadAdminProgram();
    } catch (error) {
      booting = false;
      setMessage(`서버 데이터를 불러오지 못했습니다: ${error.message || error}`, 'error');
    }
  }

  if (!bridge?.available) {
    setMessage('Firebase 연결 설정을 불러오지 못했습니다.', 'error');
    return;
  }

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setMessage('로그인 중…');
    try {
      await bridge.signIn(emailInput.value, passwordInput.value);
      passwordInput.value = '';
    } catch (error) {
      setMessage(error.message || '로그인에 실패했습니다.', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  signOutButton?.addEventListener('click', async () => {
    await bridge.signOut();
    location.reload();
  });

  window.addEventListener('finder-firebase-status', event => {
    const detail = event.detail || {};
    const saveState = document.getElementById('saveState');
    if (!saveState || !adminLoaded) return;
    if (detail.state === 'saved') saveState.style.color = '#16834b';
    else if (detail.state === 'error') saveState.style.color = '#bd2531';
    else saveState.style.color = '#c16a00';
    saveState.textContent = detail.text || saveState.textContent;
  });

  bridge.observeAuth(user => {
    if (!user) {
      gate.hidden = false;
      adminApp.hidden = true;
      document.body.classList.add('firebase-auth-pending');
      setMessage('관리자 이메일과 비밀번호로 로그인하세요.');
      return;
    }
    if (!bridge.isAuthorizedAdmin(user)) {
      bridge.signOut();
      setMessage('이 계정에는 관리자 권한이 없습니다.', 'error');
      return;
    }
    unlock(user);
  });
})();
