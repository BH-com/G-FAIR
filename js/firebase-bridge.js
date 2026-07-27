(() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const config = window.FINDER_FIREBASE_CONFIG;
  const adminUid = String(window.FINDER_FIREBASE_ADMIN_UID || '').trim();
  const projectPath = String(window.FINDER_FIREBASE_PROJECT_PATH || 'projects/current').replace(/^\/+|\/+$/g, '');

  function emit(state, text, error = null) {
    window.dispatchEvent(new CustomEvent('finder-firebase-status', {
      detail: { state, text, error: error ? String(error.message || error) : '' }
    }));
  }

  if (!config || !window.firebase) {
    const error = new Error('Firebase SDK 또는 연결 설정을 불러오지 못했습니다.');
    window.FINDER_FIREBASE = {
      available: false,
      error,
      waitForInitialProject: () => Promise.reject(error),
      subscribeProject: () => () => {},
      scheduleProjectSave: () => false,
      saveProjectNow: () => Promise.reject(error),
      signIn: () => Promise.reject(error),
      signOut: () => Promise.resolve(),
      observeAuth: callback => { callback(null); return () => {}; },
      isAuthorizedAdmin: () => false
    };
    emit('error', error.message, error);
    return;
  }

  const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(config);
  const database = app.database();
  const auth = app.auth();
  const projectRef = database.ref(projectPath);
  let initialProjectPromise = null;
  let writeTimer = 0;
  let pendingProject = null;

  function currentUser() {
    return auth.currentUser || null;
  }

  function isAuthorizedAdmin(user = currentUser()) {
    return !!(user && adminUid && user.uid === adminUid);
  }

  function waitForInitialProject(force = false) {
    if (!initialProjectPromise || force) {
      emit('loading', 'Firebase에서 최신 전시장 정보를 불러오는 중…');
      initialProjectPromise = projectRef.once('value').then(snapshot => {
        const value = snapshot.exists() ? snapshot.val() : null;
        emit(value ? 'loaded' : 'empty', value ? '최신 전시장 정보를 불러왔습니다.' : 'Firebase에 전시장 정보가 없습니다.');
        return value ? clone(value) : null;
      }).catch(error => {
        initialProjectPromise = null;
        emit('error', 'Firebase 데이터를 불러오지 못했습니다.', error);
        throw error;
      });
    }
    return initialProjectPromise;
  }

  function subscribeProject(callback, onError) {
    const handler = snapshot => {
      if (!snapshot.exists()) return;
      callback(clone(snapshot.val()));
    };
    const errorHandler = error => {
      emit('error', 'Firebase 실시간 연결에 문제가 발생했습니다.', error);
      if (typeof onError === 'function') onError(error);
    };
    projectRef.on('value', handler, errorHandler);
    return () => projectRef.off('value', handler);
  }

  async function saveProjectNow(project = pendingProject) {
    if (!project) return null;
    const user = currentUser();
    if (!isAuthorizedAdmin(user)) {
      const error = new Error('허가된 관리자 로그인이 필요합니다.');
      emit('auth-required', error.message, error);
      throw error;
    }
    const data = clone(project);
    emit('saving', 'Firebase 서버에 저장 중…');
    await projectRef.set(data);
    pendingProject = null;
    emit('saved', `서버 반영 완료 · ${new Date().toLocaleTimeString()}`);
    return data;
  }

  function scheduleProjectSave(project, delay = 1800) {
    pendingProject = clone(project);
    clearTimeout(writeTimer);
    if (!isAuthorizedAdmin()) return false;
    emit('queued', '로컬 저장 완료 · 서버 반영 대기');
    writeTimer = window.setTimeout(() => {
      saveProjectNow().catch(error => emit('error', '서버 저장에 실패했습니다.', error));
    }, Math.max(250, Number(delay) || 1800));
    return true;
  }

  async function signIn(email, password) {
    await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
    const result = await auth.signInWithEmailAndPassword(String(email || '').trim(), String(password || ''));
    if (!isAuthorizedAdmin(result.user)) {
      await auth.signOut();
      throw new Error('이 계정에는 관리자 권한이 없습니다.');
    }
    return result.user;
  }

  function signOut() {
    clearTimeout(writeTimer);
    pendingProject = null;
    return auth.signOut();
  }

  function observeAuth(callback) {
    return auth.onAuthStateChanged(callback, error => {
      emit('error', '관리자 로그인 상태를 확인하지 못했습니다.', error);
      callback(null, error);
    });
  }

  window.FINDER_FIREBASE = {
    available: true,
    app,
    database,
    auth,
    projectPath,
    adminUid,
    waitForInitialProject,
    subscribeProject,
    scheduleProjectSave,
    saveProjectNow,
    signIn,
    signOut,
    observeAuth,
    currentUser,
    isAuthorizedAdmin
  };
})();
