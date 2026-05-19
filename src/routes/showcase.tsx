import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/tasqr-button";
import { Card } from "@/components/ui/tasqr-card";
import { Input, Textarea, Select, Label } from "@/components/ui/tasqr-form";
import { Badge } from "@/components/ui/tasqr-badge";
import { AgentCard } from "@/components/ui/agent-card";

export const Route = createFileRoute("/showcase")({
  head: () => ({
    meta: [
      { title: "Tasqr — Design System Showcase" },
      { name: "description", content: "Tasqr design system components, tokens, and layout primitives." },
    ],
  }),
  component: Showcase,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <div className="text-label">Section</div>
        <h2 className="font-mono text-[24px]">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Swatch({ name, hex, varClass }: { name: string; hex: string; varClass: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`h-16 rounded-[4px] border border-border ${varClass}`} />
      <div className="font-mono text-xs text-foreground">{name}</div>
      <div className="font-mono text-[11px] text-muted-foreground">{hex}</div>
    </div>
  );
}

function Showcase() {
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-8 py-10 space-y-14">
        <header className="space-y-2">
          <div className="text-label">Tasqr</div>
          <h1 className="font-mono text-[32px]">Design System Showcase</h1>
          <p className="text-muted-foreground text-[13px] max-w-2xl">
            The complete foundation: tokens, typography, and reusable components.
            No screens yet — everything below renders from the same primitives every
            future Tasqr page will inherit.
          </p>
        </header>

        <Section title="Color Tokens">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <Swatch name="Background" hex="#0B0E14" varClass="bg-background" />
            <Swatch name="Surface" hex="#121212" varClass="bg-surface" />
            <Swatch name="Surface Raised" hex="#1E293B" varClass="bg-surface-raised" />
            <Swatch name="Border" hex="#334155" varClass="bg-border" />
            <Swatch name="Sidebar / Header" hex="#283593" varClass="bg-sidebar" />
            <Swatch name="Primary" hex="#1976D2" varClass="bg-primary" />
            <Swatch name="Text Primary" hex="#E2E8F0" varClass="bg-foreground" />
            <Swatch name="Text Muted" hex="#94A3B8" varClass="bg-muted-foreground" />
            <Swatch name="Warning" hex="#FFD600" varClass="bg-warning" />
            <Swatch name="Danger" hex="#F4511E" varClass="bg-destructive" />
          </div>
        </Section>

        <Section title="Typography Scale">
          <Card className="space-y-4">
            <div>
              <div className="text-label">H1 · IBM Plex Mono · 32px</div>
              <h1 className="font-mono text-[32px]">The quick brown fox</h1>
            </div>
            <div>
              <div className="text-label">H2 · IBM Plex Mono · 24px</div>
              <h2 className="font-mono text-[24px]">The quick brown fox</h2>
            </div>
            <div>
              <div className="text-label">H3 · IBM Plex Mono · 18px</div>
              <h3 className="font-mono text-[18px]">The quick brown fox</h3>
            </div>
            <div>
              <div className="text-label">Body · Public Sans · 14px</div>
              <p className="font-sans text-[14px] text-foreground">
                The quick brown fox jumps over the lazy dog.
              </p>
            </div>
            <div>
              <div className="text-label">Muted · Public Sans · 13px</div>
              <p className="font-sans text-[13px] text-muted-foreground">
                The quick brown fox jumps over the lazy dog.
              </p>
            </div>
            <div>
              <div className="text-label">Label · IBM Plex Mono · 12px · 0.05em</div>
              <span className="text-label">Field Label Example</span>
            </div>
          </Card>
        </Section>

        <Section title="Buttons">
          <Card className="space-y-6">
            <div>
              <div className="text-label mb-3">Primary</div>
              <div className="flex flex-wrap gap-3">
                <Button>Default</Button>
                <Button>Hover (try it)</Button>
                <Button>Active (click)</Button>
                <Button disabled>Disabled</Button>
              </div>
            </div>
            <div>
              <div className="text-label mb-3">Secondary</div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary">Default</Button>
                <Button variant="secondary">Hover</Button>
                <Button variant="secondary" disabled>Disabled</Button>
              </div>
            </div>
            <div>
              <div className="text-label mb-3">Danger</div>
              <div className="flex flex-wrap gap-3">
                <Button variant="danger">Delete Agent</Button>
                <Button variant="danger" disabled>Disabled</Button>
              </div>
            </div>
          </Card>
        </Section>

        <Section title="Form Elements">
          <Card className="space-y-5 max-w-xl">
            <div>
              <Label htmlFor="agent-name">Agent Name</Label>
              <Input id="agent-name" placeholder="e.g. Pipeline Inspector" />
            </div>
            <div>
              <Label htmlFor="agent-desc">Description</Label>
              <Textarea id="agent-desc" placeholder="Briefly describe what this agent does..." />
            </div>
            <div>
              <Label htmlFor="agent-cat">Category</Label>
              <Select id="agent-cat" defaultValue="">
                <option value="" disabled>Select a category</option>
                <option>Inspection</option>
                <option>Scheduling</option>
                <option>Reporting</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="agent-disabled">Disabled Input</Label>
              <Input id="agent-disabled" disabled placeholder="Not editable" />
            </div>
          </Card>
        </Section>

        <Section title="Badges">
          <Card className="flex flex-wrap items-center gap-3">
            <Badge variant="category">Inspection</Badge>
            <Badge variant="reliability-high">Reliability: High</Badge>
            <Badge variant="status-live">Live</Badge>
            <Badge variant="status-paused">Paused</Badge>
            <Badge variant="status-review">Under Review</Badge>
          </Card>
        </Section>

        <Section title="Cards">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <div className="text-label mb-2">Default Card</div>
              <p className="text-sm text-foreground">
                Surface raised background, 1px border, 4px radius, 16px padding.
                The base for every panel in Tasqr.
              </p>
            </Card>
            <AgentCard
              name="Pipeline Inspector"
              description="Continuously scans CI/CD pipelines for failures and anomalies."
              category="Inspection"
              price="$24/mo"
              rating={4.5}
            />
            <AgentCard
              name="Shift Scheduler"
              description="Auto-generates shift rosters based on availability and skill."
              category="Scheduling"
              price="$18/mo"
              rating={4.0}
            />
            <AgentCard
              name="Daily Report Bot"
              description="Compiles end-of-day status reports across all active projects."
              category="Reporting"
              price="$12/mo"
              rating={3.5}
            />
          </div>
        </Section>

        <Section title="Layout Shell">
          <Card>
            <p className="text-sm text-muted-foreground">
              You're looking at it. Top header (Midnight Indigo, 60px), left sidebar
              (Midnight Indigo, 240px), main area (Ink Black). The entire showcase
              renders inside the shell so the structural wrapper is verifiable in place.
            </p>
          </Card>
        </Section>
      </div>
    </AppShell>
  );
}
