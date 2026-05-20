import { ReactNode, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/signin" });
  }, [loading, session, navigate]);

  if (loading || !session) return null;
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/browse" });
  }, [loading, session, navigate]);

  if (loading || session) return null;
  return <>{children}</>;
}

export function RequireSellerMode({ children }: { children: ReactNode }) {
  const { mode, loading } = useMode();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && mode !== "seller") navigate({ to: "/browse" });
  }, [loading, mode, navigate]);

  if (loading || mode !== "seller") return null;
  return <>{children}</>;
}
