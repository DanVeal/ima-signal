// Split from theme-context.tsx (a "use client" module) so the root layout —
// a Server Component — can read the plain string value directly rather than
// a client-reference proxy, which is what an import from a "use client" file
// resolves to on the server and serializes to `undefined`.
export const THEME_STORAGE_KEY = "ima-signal.theme";
