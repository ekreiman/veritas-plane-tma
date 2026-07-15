import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, getDisplayName, getSessionToken, isSessionValid, setSession } from './session';

describe('session storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearSession();
  });

  it('starts with no valid session', () => {
    expect(isSessionValid()).toBe(false);
    expect(getSessionToken()).toBeNull();
  });

  it('stores and retrieves a freshly minted session', () => {
    setSession({ session_token: 'tok123', display_name: 'Werner', expires_in_seconds: 900 });
    expect(getSessionToken()).toBe('tok123');
    expect(getDisplayName()).toBe('Werner');
    expect(isSessionValid()).toBe(true);
  });

  it('treats an expired session as invalid and clears it', () => {
    setSession({ session_token: 'tok456', display_name: 'Werner', expires_in_seconds: -1 });
    expect(getSessionToken()).toBeNull();
    expect(isSessionValid()).toBe(false);
    // Clearing on read should also wipe storage so a stale token can't
    // resurface on the next getSessionToken() call.
    expect(sessionStorage.getItem('verita…n_v1')).toBeNull();
  });

  it('clearSession() removes a valid session', () => {
    setSession({ session_token: 'tok789', display_name: 'Werner', expires_in_seconds: 900 });
    clearSession();
    expect(getSessionToken()).toBeNull();
  });
});
