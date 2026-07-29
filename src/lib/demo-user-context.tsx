"use client";

/**
 * Phase 1 has no Supabase Auth yet. This context simulates "who is signed
 * in" purely so navigation, the dashboard and permission-aware UI can be
 * previewed against every role before Phase 2 wires up real sessions. It
 * is a demo affordance only — every place it's surfaced in the UI says so.
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
