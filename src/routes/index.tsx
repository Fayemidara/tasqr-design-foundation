import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tasqr" },
      { name: "description", content: "Tasqr — design system foundation." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-4">
        <div className="text-label">Tasqr</div>
        <h1 className="font-mono text-[32px]">Design System Ready</h1>
        <p className="text-sm text-muted-foreground">
          The foundation is in place. Every component, token, and layout primitive
          lives on the showcase page.
        </p>
        <Link
          to="/showcase"
          className="inline-flex items-center justify-center h-10 px-4 bg-primary text-primary-foreground font-mono text-sm rounded-[4px] hover:bg-[oklch(0.5_0.16_255)] transition-colors"
        >
          Open /showcase
        </Link>
      </div>
    </div>
  );
}
