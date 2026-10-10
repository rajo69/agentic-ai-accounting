// Demo-mode flag. Tiny on purpose: `lib/api.ts` imports this statically, everything else in
// `src/demo` is loaded on demand only when the flag is set.
//
// Safety: `isDemo()` is false on the server and whenever storage is unavailable, and
// NEXT_PUBLIC_DEMO_ENABLED=0 switches the whole mechanism off at build time.

const KEY = "demo_mode";

export function isDemo(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (process.env.NEXT_PUBLIC_DEMO_ENABLED === "0") return false;
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function enterDemo(opts: { skipOnboarding?: boolean } = {}) {
  localStorage.setItem(KEY, "1");
  // The middleware only checks that the cookie exists; the value marks it as a demo session.
  document.cookie = "has_session=demo; path=/; SameSite=Lax; Max-Age=86400";
  // The dashboard polls this job on first load and shows the import toast (same path as a real
  // first login). With skipOnboarding the store starts fully populated instead.
  if (!opts.skipOnboarding) sessionStorage.setItem("first_sync_job_id", "demo-job-sync-1");
}

export function exitDemo(opts: { silent?: boolean } = {}) {
  localStorage.removeItem(KEY);
  localStorage.removeItem("demo_state_v2");
  document.cookie = "has_session=; Max-Age=0; path=/";
  sessionStorage.removeItem("first_sync_job_id");
  if (!opts.silent) window.location.href = "/";
}
