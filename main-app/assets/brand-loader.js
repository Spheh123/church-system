(() => {
  const logoUrl = new URL('church-logo-original.png', document.currentScript.src).href;
  const started = performance.now();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let returning = false;
  try { returning = sessionStorage.getItem('sojj-welcomed') === 'yes'; sessionStorage.setItem('sojj-welcomed', 'yes'); } catch {}
  const overlay = document.createElement('div');
  overlay.className = 'sojj-loader';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-label', 'Loading Streams of Joy Johannesburg');
  const stage = document.createElement('div'); stage.className = 'sojj-loader__stage';
  const logo = document.createElement('img'); logo.className = 'sojj-loader__logo'; logo.src = logoUrl; logo.alt = ''; logo.width = 2048; logo.height = 768;
  const shadow = document.createElement('span'); shadow.className = 'sojj-loader__shadow';
  const ring = document.createElement('span'); ring.className = 'sojj-loader__ring';
  const status = document.createElement('p'); status.className = 'sojj-loader__status'; status.textContent = 'Welcome to Streams of Joy';
  stage.append(logo, shadow, ring, status); overlay.append(stage); document.body.prepend(overlay);
  let finished = false;
  const finish = () => {
    if (finished) return; finished = true;
    const minimum = reducedMotion ? 0 : returning ? 200 : 1050;
    setTimeout(() => { overlay.classList.add('is-leaving'); setTimeout(() => overlay.remove(), reducedMotion ? 0 : 500); }, Math.max(0, minimum - (performance.now() - started)));
  };
  // Asset or network problems must never trap visitors behind a loading screen.
  logo.addEventListener('error', finish, {once:true});
  if (document.readyState === 'complete') finish();
  else window.addEventListener('load', finish, {once:true});
  window.addEventListener('pageshow', event => { if (event.persisted) overlay.remove(); }, {once:true});
  setTimeout(finish, 4000);
})();
