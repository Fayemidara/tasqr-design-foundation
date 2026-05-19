import { ReactNode } from "react";
import { cn } from "@/lib/utils";

const navItems = ["Dashboard", "Agents", "Marketplace", "Analytics", "Settings"];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-[60px] bg-sidebar flex items-center px-6 border-b border-border">
        <span className="font-mono text-lg font-semibold tracking-tight text-sidebar-foreground">
          TASQR
        </span>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="w-[240px] bg-sidebar border-r border-border py-4">
          <nav className="flex flex-col gap-1 px-3">
            {navItems.map((item, i) => (
              <a
                key={item}
                href="#"
                className={cn(
                  "font-mono text-sm px-3 py-2 rounded-[4px] text-sidebar-foreground/80 hover:bg-white/5 hover:text-sidebar-foreground transition-colors",
                  i === 0 && "bg-white/10 text-sidebar-foreground",
                )}
              >
                {item}
              </a>
            ))}
          </nav>
        </aside>
        <main className="flex-1 bg-background overflow-auto">{children}</main>
      </div>
    </div>
  );
}
