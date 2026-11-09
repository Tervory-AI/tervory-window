// Sign-in state for the panel. Login itself is only ever cli/src/client.mjs.
export const EXPIRED = 'Your sign-in has expired. Trigger sign-in again to continue.';
const STALE = [/^Login required\b/, /^Login expired\b/, /^Personal token refused\.$/, /^Login code expired\b/];

/** True when an error means the stored sign-in no longer works and the user must sign in again. */
export const expiredSignIn = error => STALE.some(pattern => pattern.test(String(error?.message ?? '')));

/** What the panel shows on open: signed in, signed out, or expired (no network call). */
export async function signInState(store, now = Date.now) {
  let raw;
  try { raw = await store.get(); } catch { return { signedIn: false }; }
  if (typeof raw !== 'string' || !raw) return { signedIn: false };
  try {
    const value = JSON.parse(raw);
    if (value?.version === 1 && Date.parse(value.refresh_expires_at) <= now()) return { signedIn: false, expired: true, reason: EXPIRED };
  } catch { /* A CLI 0.1 personal token is a plain string and stays signed in until refused. */ }
  return { signedIn: true };
}
