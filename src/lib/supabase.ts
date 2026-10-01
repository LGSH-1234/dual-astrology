import { createClient } from '@supabase/supabase-js';
import { CLOUD } from '../config/cloud';

const enabled = typeof location !== 'undefined' && location.protocol !== 'file:'
  && import.meta.env.VITE_SUPABASE_ENABLED !== 'false'
  && (import.meta.env.PROD || import.meta.env.VITE_SUPABASE_ENABLED === 'true');

export const supabase = enabled ? createClient(
  import.meta.env.VITE_SUPABASE_URL || CLOUD.url,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || CLOUD.publishableKey,
  { auth: { storageKey: 'dio:supabase-auth', detectSessionInUrl: false, flowType: 'implicit' } },
) : null;

export function authRedirectUrl() {
  return new URL(import.meta.env.BASE_URL, location.origin).href;
}

// Supabase email links use the hash too; consume them before our hash router.
export async function consumeAuthRedirect() {
  if (!supabase) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return;
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  const route = error ? '#/login' : params.get('type') === 'recovery' ? '#/reset?token=recovery' : '#/ask';
  history.replaceState(null, '', location.pathname + location.search + route);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  if (error) throw error;
}

export async function cloudHeaders() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || CLOUD.publishableKey,
    ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
  };
}

export function cloudEndpoint(action: 'interpret' | 'status') {
  const url = import.meta.env.VITE_SUPABASE_URL || CLOUD.url;
  return `${url}/functions/v1/dual-astrology-api/${action}`;
}
