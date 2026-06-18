import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/tasqr-button";
import { Input, Label } from "@/components/ui/tasqr-form";
import { RedirectIfAuthed } from "@/components/auth/require-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signin")({
  head: () => ({ meta: [{ title: "Sign In — Tasqr" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: () => (
    <RedirectIfAuthed>
      <SignIn />
    </RedirectIfAuthed>
  ),
});

function SignIn() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    if (redirect && redirect.startsWith("/")) {
      window.location.href = redirect;
    } else {
      navigate({ to: "/browse" });
    }
  };

  return (
    <AuthLayout>
      <h1 className="font-mono text-[24px] mb-6">Sign In</h1>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="password" className="mb-0">Password</Label>
            <Link to="/forgot-password" className="font-mono text-[11px] text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="font-mono text-xs text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground font-sans">
        Don't have an account?{" "}
        <Link to="/signup" className="text-primary hover:underline">Sign up</Link>
      </p>
    </AuthLayout>
  );
}
