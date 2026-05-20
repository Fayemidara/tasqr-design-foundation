import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";
import { supabase } from "@/integrations/supabase/client";

const buyerNav = [
  { label: "Browse", to: "/browse" },
  { label: "My Runs", to: "/runs" },
];

const sellerNav = [
  { label: "Dashboard", to: "/seller/dashboard" },
  { label: "Earnings", to: "/seller/earnings" },
  { label: "Settings", to: "/seller/settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { mode, role, setMode } = useMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/signin" });
  };

  const isBoth = role === "both";
  const isSellerMode = mode === "seller";

  const switchMode = (next: "buyer" | "seller") => {
    if (next === mode) return;
    setMode(next);
    navigate({ to: next === "seller" ? "/seller/dashboard" : "/browse" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-[60px] bg-sidebar flex items-center justify-between px-6 border-b border-border">
        <span className="font-mono text-lg font-semibold tracking-tight text-sidebar-foreground">
          TASQR
        </span>
        {user && (
          <div className="flex items-center gap-4">
            {isBoth && (
              <div className="flex items-center bg-white/5 border border-border rounded-full p-0.5">
                <button
                  onClick={() => switchMode("buyer")}
                  className={cn(
                    "font-mono text-xs uppercase tracking-wide px-3 py-1 rounded-full transition-colors",
                    !isSellerMode
                      ? "text-white"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
                  )}
                  style={!isSellerMode ? { backgroundColor: "#1976D2" } : undefined}
                >
                  Buying
                </button>
                <button
                  onClick={() => switchMode("seller")}
                  className={cn(
                    "font-mono text-xs uppercase tracking-wide px-3 py-1 rounded-full transition-colors",
                    isSellerMode
                      ? "text-white"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
                  )}
                  style={isSellerMode ? { backgroundColor: "#1976D2" } : undefined}
                >
                  Selling
                </button>
              </div>
            )}
            <div className="relative" ref={ref}>
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 font-mono text-sm text-sidebar-foreground hover:text-white transition-colors"
              >
                <span>{user.email}</span>
                <ChevronDown className="h-4 w-4" />
              </button>
              {open && (
                <div className="absolute right-0 mt-2 w-48 bg-surface-raised border border-border rounded-[4px] py-1 z-50">
                  <Link
                    to="/profile"
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 font-mono text-sm text-foreground hover:bg-white/5"
                  >
                    Profile
                  </Link>
                  {!isSellerMode && isBoth && (
                    <button
                      onClick={() => {
                        setOpen(false);
                        switchMode("seller");
                      }}
                      className="block w-full text-left px-3 py-2 font-mono text-sm text-foreground hover:bg-white/5"
                    >
                      Seller Dashboard
                    </button>
                  )}
                  {!isSellerMode && !isBoth && (
                    <button
                      onClick={async () => {
                        setOpen(false);
                        if (!user) return;
                        const { data } = await supabase
                          .from("profiles")
                          .select("is_seller_onboarded")
                          .eq("id", user.id)
                          .maybeSingle();
                        navigate({
                          to: data?.is_seller_onboarded
                            ? "/seller/dashboard"
                            : "/seller/onboarding",
                        });
                      }}
                      className="block w-full text-left px-3 py-2 font-mono text-sm text-foreground hover:bg-white/5"
                    >
                      Become a Seller
                    </button>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-left px-3 py-2 font-mono text-sm text-foreground hover:bg-white/5"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="w-[240px] bg-sidebar border-r border-border py-4 flex flex-col">
          <nav className="flex flex-col gap-1 px-3 flex-1">
            {(isSellerMode ? sellerNav : buyerNav).map((item) => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "font-mono text-sm px-3 py-2 rounded-[4px] text-sidebar-foreground/80 hover:bg-white/5 hover:text-sidebar-foreground transition-colors",
                    active && "bg-white/10 text-sidebar-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {isSellerMode && (
            <div className="px-3 pt-4">
              <Link
                to="/seller/agents/new"
                className="block w-full text-center font-mono text-sm px-3 py-2 rounded-[4px] text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#1976D2" }}
              >
                List New Agent
              </Link>
            </div>
          )}
        </aside>
        <main className="flex-1 bg-background overflow-auto">{children}</main>
      </div>
    </div>
  );
}
