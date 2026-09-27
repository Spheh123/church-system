import { supabase } from '../../shared/supabase.js';
import { appConfig, defaultRouteByRole } from '../../shared/config.js';

const form = document.getElementById('changePasswordForm');
const message = document.getElementById('passwordMessage');

function showMessage(text, type = 'error') {
  message.textContent = text;
  message.classList.remove('hidden', 'success', 'error');
  message.classList.add(type);
}

function passwordChangeRequired(user) {
  const marker = user?.app_metadata?.staff_password_change;
  return !String(marker || '').startsWith('completed:');
}

async function routeForCurrentUser(session) {
  if (passwordChangeRequired(session.user)) return;
  const { data: profile } = await supabase.from('users').select('role').eq('id', session.user.id).maybeSingle();
  window.location.replace(defaultRouteByRole[profile?.role] || 'people.html');
}

document.querySelectorAll('[data-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.toggle);
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.textContent = visible ? 'Show' : 'Hide';
  });
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const password = document.getElementById('newPassword').value;
  const confirmation = document.getElementById('confirmPassword').value;
  const button = event.submitter;

  if (password !== confirmation) return showMessage('The two passwords do not match.');
  if (password.length < 10 || password.length > 64 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || /\s/.test(password)) {
    return showMessage('Use 10–64 characters with an uppercase letter, lowercase letter and number, without spaces.');
  }

  button.disabled = true;
  button.textContent = 'Saving password…';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Your temporary session has ended. Sign in again.');
    const response = await fetch(appConfig.changeOwnPasswordPath, {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ password }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The password could not be saved.');
    showMessage('Password saved. Returning you to sign in…', 'success');
    await supabase.auth.signOut({ scope: 'local' });
    window.setTimeout(() => window.location.replace('login.html?password=changed'), 500);
  } catch (error) {
    showMessage(error.message || 'The password could not be saved. Please try again.');
    button.disabled = false;
    button.innerHTML = 'Save my password <span aria-hidden="true">→</span>';
  }
});

supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session) window.location.replace('login.html');
  else routeForCurrentUser(session).catch(error => showMessage(error.message));
});
