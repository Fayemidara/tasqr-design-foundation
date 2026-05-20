import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/tasqr-button";
import { Input, Label } from "@/components/ui/tasqr-form";
import { RedirectIfAuthed } from "@/components/auth/require-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign Up — Tasqr" }] }),
  component: () => (
    <RedirectIfAuthed>
      <SignUp />
    </RedirectIfAuthed>
  ),
});

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 font-mono text-xs text-destructive">{msg}</p>;
}

function SignUp() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = "Full name is required";
    if (!email.trim()) errs.email = "Email is required";
    if (password.length < 6) errs.password = "Password must be at least 6 characters";
    if (password !== confirm) errs.confirm = "Passwords do not match";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/browse`,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) {
      setErrors({ email: error.message });
      return;
    }
    navigate({ to: "/browse" });
  };

  return (
    <AuthLayout>
      <h1 className="font-mono text-[24px] mb-6">Create Account</h1>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="fullName">Full Name</Label>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <FieldError msg={errors.fullName} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <FieldError msg={errors.email} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <FieldError msg={errors.password} />
        </div>
        <div>
          <Label htmlFor="confirm">Confirm Password</Label>
          <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <FieldError msg={errors.confirm} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating..." : "Create Account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground font-sans">
        Already have an account?{" "}
        <Link to="/signin" className="text-primary hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
