import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useAuth } from "./use-auth";
import { supabase } from "@/integrations/supabase/client";

export type Mode = "buyer" | "seller";

interface ModeCtx {
  mode: Mode;
  role: string | null;
  loading: boolean;
  setMode: (m: Mode) => void;
}

const Ctx = createContext<ModeCtx>({ mode: "buyer", role: null, loading: true, setMode: () => {} });

const STORAGE_KEY = "tasqr_mode";

export function ModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof window === "undefined") return "buyer";
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "seller" ? "seller" : "buyer";
  });

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setRole(data?.role ?? null);
        // If user isn't 'both', force mode based on role
        if (data?.role !== "both" && mode === "seller") {
          setModeState("buyer");
          window.localStorage.setItem(STORAGE_KEY, "buyer");
        }
        setLoading(false);
      });
  }, [user]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, m);
  }, []);

  return <Ctx.Provider value={{ mode, role, loading, setMode }}>{children}</Ctx.Provider>;
}

export const useMode = () => useContext(Ctx);
