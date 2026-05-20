import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/tasqr-button";
import { Input, Label } from "@/components/ui/tasqr-form";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot Password — Tasqr" }] }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/signin`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  };

  return (
    <AuthLayout>
      <h1 className="font-mono text-[24px] mb-6">Reset Password</h1>
      {sent ? (
        <p className="text-sm text-foreground font-sans">
          Check your email for a reset link.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <p className="mt-1 font-mono text-xs text-destructive">{error}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground font-sans">
        <Link to="/signin" className="text-primary hover:underline">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}
