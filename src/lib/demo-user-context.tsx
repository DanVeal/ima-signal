"use client";

/**
 * Phase 2A adds a real Supabase Auth session (see /login, middleware.ts,
 * src/lib/supabase/) gating every route this context is used in — but the
 * rest of the frontend still runs on mock data (src/lib/mock/), so this
 * context remains a client-only "preview as" affordance for seeing
 * navigation/dashboard/permission-aware UI render against every role. It is
 * not a substitute for the real session, and nothing here is trusted for
 * authorization — that's the database's job (RLS), not this context's.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { users } from "@/lib/mock/data";
import type { UserProfile } from "@/types/domain";

const STORAGE_KEY = "ima-signal.preview-user";
const DEFAULT_USER_ID = "user-tom";

interface DemoUserContextValue {
  currentUser: UserProfile;
  setCurrentUserId: (userId: string) => void;
}

const DemoUserContext = createContext<DemoUserContextValue | undefined>(undefined);

export function DemoUserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState(DEFAULT_USER_ID);

  useEffect(() => {
    // Deferred to an effect deliberately: reading localStorage during the
    // initial render would return different values on the server (none)
    // vs. the client (a saved preview user), causing a hydration mismatch.
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && users.some((u) => u.id === stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserId(stored);
    }
  }, []);

  const setCurrentUserId = (id: string) => {
    setUserId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  };

  const currentUser = useMemo(
    () => users.find((u) => u.id === userId) ?? users[0],
    [userId],
  );

  return (
    <DemoUserContext.Provider value={{ currentUser, setCurrentUserId }}>
      {children}
    </DemoUserContext.Provider>
  );
}

export function useDemoUser() {
  const ctx = useContext(DemoUserContext);
  if (!ctx) throw new Error("useDemoUser must be used within DemoUserProvider");
  return ctx;
}
