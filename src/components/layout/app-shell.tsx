import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Menu, X } from "lucide-react";
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
  { label: "Documentation", to: "/seller/docs" },
  { label: "Settings", to: "/seller/settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { mode, role, setMode } = useMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

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

  const initials =
    (user?.email ?? "?").trim().slice(0, 2).toUpperCase();

  const navItems = isSellerMode ? sellerNav : buyerNav;

  const SidebarBody = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <nav className="flex flex-col gap-1 px-3 flex-1">
        {isBoth && (
          <div className="lg:hidden flex items-center bg-white/5 border border-border rounded-full p-0.5 mb-3 mx-1">
            <button
              onClick={() => {
                switchMode("buyer");
                onNavigate?.();
              }}
              className={cn(
                "flex-1 font-mono text-xs uppercase tracking-wide px-3 py-2 rounded-full transition-colors",
                !isSellerMode
                  ? "text-white"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
              )}
              style={!isSellerMode ? { backgroundColor: "#1976D2" } : undefined}
            >
              Buying
            </button>
            <button
              onClick={() => {
                switchMode("seller");
                onNavigate?.();
              }}
              className={cn(
                "flex-1 font-mono text-xs uppercase tracking-wide px-3 py-2 rounded-full transition-colors",
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
        {navItems.map((item) => {
          const active = location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "font-mono text-sm px-3 py-2 min-h-[44px] flex items-center rounded-[4px] text-sidebar-foreground/80 hover:bg-white/5 hover:text-sidebar-foreground transition-colors",
                active && "bg-white/10 text-sidebar-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-[60px] bg-sidebar flex items-center justify-between px-4 sm:px-6 border-b border-border">
        <div className="flex items-center gap-3">
          {user && (
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              className="lg:hidden inline-flex items-center justify-center h-11 w-11 -ml-2 rounded-[4px] text-sidebar-foreground hover:bg-white/5"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <Link
            to="/browse"
            className="font-mono text-lg font-semibold tracking-tight text-sidebar-foreground"
          >
            TASQR
          </Link>
        </div>
        {!user && (
          <div className="flex items-center gap-2">
            <Link
              to="/signin"
              className="font-mono text-xs uppercase tracking-wide px-3 sm:px-4 h-9 inline-flex items-center rounded-[4px] border border-border text-sidebar-foreground hover:bg-white/5 transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="font-mono text-xs uppercase tracking-wide px-3 sm:px-4 h-9 inline-flex items-center rounded-[4px] text-white transition-colors"
              style={{ backgroundColor: "#1976D2" }}
            >
              Get Started
            </Link>
          </div>
        )}
        {user && (
          <div className="flex items-center gap-3 sm:gap-4">
            {isBoth && (
              <div className="hidden lg:flex items-center bg-white/5 border border-border rounded-full p-0.5">
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
                className="flex items-center gap-2 font-mono text-sm text-sidebar-foreground hover:text-white transition-colors min-h-[44px]"
                aria-label="Account menu"
              >
                <span className="hidden md:inline truncate max-w-[200px]">{user.email}</span>
                <span className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-full bg-white/10 font-mono text-xs">
                  {initials}
                </span>
                <ChevronDown className="h-4 w-4 hidden md:inline" />
              </button>
              {open && (
                <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-surface-raised border border-border rounded-[4px] py-1 z-50">
                  <Link
                    to="/profile"
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 min-h-[44px] leading-7 font-mono text-sm text-foreground hover:bg-white/5 truncate"
                  >
                    Profile
                  </Link>
                  {!isSellerMode && isBoth && (
                    <button
                      onClick={() => {
                        setOpen(false);
                        switchMode("seller");
                      }}
                      className="block w-full text-left px-3 py-2 min-h-[44px] font-mono text-sm text-foreground hover:bg-white/5"
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
                      className="block w-full text-left px-3 py-2 min-h-[44px] font-mono text-sm text-foreground hover:bg-white/5"
                    >
                      Become a Seller
                    </button>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-left px-3 py-2 min-h-[44px] font-mono text-sm text-foreground hover:bg-white/5"
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
        {user && (
          <aside className="hidden lg:flex w-[240px] shrink-0 bg-sidebar border-r border-border py-4 flex-col">
            <SidebarBody />
          </aside>
        )}

        {navOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setNavOpen(false)}
              aria-hidden
            />
            <aside className="relative w-[280px] max-w-[85vw] bg-sidebar border-r border-border py-4 flex flex-col">
              <div className="px-4 pb-3 flex items-center justify-between">
                <span className="font-mono text-lg font-semibold tracking-tight text-sidebar-foreground">
                  TASQR
                </span>
                <button
                  onClick={() => setNavOpen(false)}
                  aria-label="Close menu"
                  className="inline-flex items-center justify-center h-11 w-11 -mr-2 rounded-[4px] text-sidebar-foreground hover:bg-white/5"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarBody onNavigate={() => setNavOpen(false)} />
            </aside>
          </div>
        )}

        <main className="flex-1 min-w-0 bg-background overflow-auto">{children}</main>
      </div>
    </div>
  );
}
