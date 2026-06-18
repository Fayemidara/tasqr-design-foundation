import { createFileRoute } from "@tanstack/react-router";
import { useState, ReactNode } from "react";
import { Copy, Check } from "lucide-react";
import { RequireAuth, RequireSellerMode } from "@/components/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/seller/docs")({
  head: () => ({
    meta: [
      { title: "Plugin Documentation — Tasqr" },
      {
        name: "description",
        content: "Everything you need to connect your agent to Tasqr.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <RequireSellerMode>
        <AppShell>
          <DocsPage />
        </AppShell>
      </RequireSellerMode>
    </RequireAuth>
  ),
});

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="relative my-4">
      <button
        onClick={onCopy}
        aria-label="Copy code"
        className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-[4px] border border-border bg-[#1E293B] text-foreground/80 hover:text-foreground font-mono text-xs"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre
        className="overflow-x-auto rounded-[4px] border font-mono text-sm"
        style={{
          background: "#0B0E14",
          borderColor: "#334155",
          color: "#FFD600",
          padding: "16px",
          paddingRight: "72px",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mt-12 mb-3">
      {children}
    </h2>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-foreground/90 leading-relaxed">{children}</p>;
}

function Note({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "yellow" | "orange";
}) {
  const color =
    tone === "yellow" ? "#FFD600" : tone === "orange" ? "#F4511E" : undefined;
  return (
    <li
      className={cn("text-sm leading-relaxed pl-3 border-l-2")}
      style={{
        borderColor: color ?? "#334155",
        color: color ?? undefined,
      }}
    >
      {children}
    </li>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto my-4 border border-border rounded-[4px]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1E293B]">
            {headers.map((h) => (
              <th
                key={h}
                className="text-left font-mono text-xs uppercase tracking-wider text-muted-foreground px-4 py-2 border-b border-border"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-b-0">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={cn(
                    "px-4 py-2 align-top",
                    j === 0 ? "text-foreground" : "font-mono text-foreground/90",
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PAYLOAD_EXAMPLE = `{
  "tasqr_request_id": "req_abc123xyz",
  "api_key": "tsk_live_yourkey",
  "inputs": {
    "field_name": "buyer's value",
    "another_field": "another value"
  },
  "files": {
    "file_field": "https://temp-url.com/file.pdf"
  },
  "buyer_id": "usr_789",
  "timestamp": "2026-06-03T10:30:00Z"
}`;

const SUCCESS_EXAMPLE = `{
  "tasqr_request_id": "req_abc123xyz",
  "status": "success",
  "output_type": "markdown",
  "output": "Your result content here",
  "processing_time_ms": 4200
}`;

const ERROR_EXAMPLE = `{
  "tasqr_request_id": "req_abc123xyz",
  "status": "error",
  "error_code": "internal_error",
  "error_message": "Human readable message shown to buyer",
  "output_type": null,
  "output": null
}`;

const N8N_EXAMPLE = `{
  "tasqr_request_id": "{{ $json.body.tasqr_request_id }}",
  "status": "success",
  "output_type": "markdown",
  "output": "{{ $json.aiResult }}",
  "processing_time_ms": 1000
}`;

const PIPEDREAM_EXAMPLE = `export default defineComponent({
  async run({ steps, $ }) {

    // Verify API key
    const incomingKey = steps.trigger.event.body.api_key
    const expectedKey = process.env.TASQR_API_KEY
    if (incomingKey !== expectedKey) {
      return $.respond({
        status: 401,
        body: {
          tasqr_request_id: steps.trigger.event.body.tasqr_request_id,
          status: "error",
          error_code: "invalid_input",
          error_message: "Unauthorized",
          output_type: null,
          output: null
        }
      })
    }

    const { tasqr_request_id, inputs, files } = steps.trigger.event.body
    const startTime = Date.now()

    // Access your inputs like this:
    // inputs.product_name
    // inputs.description
    // files — object containing file URLs

    // Your processing here
    const result = "your output here"

    return $.respond({
      status: 200,
      body: {
        tasqr_request_id,
        status: "success",
        output_type: "markdown",
        output: result,
        processing_time_ms: Date.now() - startTime
      }
    })
  }
})`;

const PYTHON_EXAMPLE = `from flask import Flask, request, jsonify
import hashlib, time

app = Flask(__name__)
TASQR_API_KEY = "your_tsk_live_key_here"

@app.route('/run', methods=['POST'])
def run_agent():
    data = request.get_json()

    # Verify API key
    if data.get('api_key') != TASQR_API_KEY:
        return jsonify({
            "tasqr_request_id": data.get("tasqr_request_id"),
            "status": "error",
            "error_code": "invalid_input",
            "error_message": "Unauthorized",
            "output_type": None,
            "output": None
        }), 401

    tasqr_request_id = data['tasqr_request_id']
    inputs = data['inputs']  # access as inputs['field_name']
    files = data.get('files', {})

    start = time.time()

    # Your processing here
    result = "your output here"

    processing_time = int((time.time() - start) * 1000)

    return jsonify({
        "tasqr_request_id": tasqr_request_id,
        "status": "success",
        "output_type": "markdown",
        "output": result,
        "processing_time_ms": processing_time
    })`;

type Tab = "make" | "n8n" | "pipedream" | "python";

function PlatformTabs() {
  const [tab, setTab] = useState<Tab>("make");
  const tabs: { id: Tab; label: string }[] = [
    { id: "make", label: "Make.com" },
    { id: "n8n", label: "n8n" },
    { id: "pipedream", label: "Pipedream" },
    { id: "python", label: "Python" },
  ];
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "font-mono text-xs uppercase tracking-wider px-4 py-2 min-h-[40px] -mb-px border-b-2 transition-colors",
              tab === t.id
                ? "text-foreground"
                : "text-muted-foreground border-transparent hover:text-foreground",
            )}
            style={tab === t.id ? { borderColor: "#1976D2" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {tab === "make" && (
          <div className="space-y-3">
            <P>The correct module flow for Make.com:</P>
            <ol className="list-decimal pl-5 space-y-2 text-foreground/90">
              <li>Custom Webhook — trigger. Gives you your endpoint URL.</li>
              <li>Your processing modules — call your AI API, transform data, etc.</li>
              <li>
                Create JSON module — build the Tasqr response envelope.{" "}
                <strong>IMPORTANT:</strong> Do not use the Webhook Response
                module directly for JSON. Always use Create JSON first.
              </li>
              <li>
                <div>Map these fields in Create JSON:</div>
                <ul className="list-disc pl-5 mt-1 font-mono text-sm">
                  <li>tasqr_request_id → {`{{1.tasqr_request_id}}`}</li>
                  <li>status → success</li>
                  <li>output_type → markdown</li>
                  <li>output → your formatted content</li>
                  <li>processing_time_ms → 1000</li>
                </ul>
              </li>
              <li>
                Webhook Response module — Set body to {`{{N.json}}`} where N is
                the Create JSON module number. Set Content-Type header to
                application/json. Set status to 200.
              </li>
            </ol>
            <div
              className="p-4 rounded-[4px] border text-sm"
              style={{ borderColor: "#F4511E", color: "#F4511E" }}
            >
              Common Make mistake: Do not put markdown content directly in the
              Webhook Response body. Always route through Create JSON first or
              Tasqr will receive plain text instead of JSON.
            </div>
            <div
              className="p-4 rounded-[4px] border text-sm"
              style={{ borderColor: "#FFD600", color: "#FFD600" }}
            >
              If your AI returns JSON wrapped in code fences (```json ... ```)
              add this to your system prompt: "Return only raw JSON with no
              markdown formatting, no code fences, no backticks."
            </div>
          </div>
        )}
        {tab === "n8n" && (
          <div className="space-y-3">
            <P>The correct node flow for n8n:</P>
            <ol className="list-decimal pl-5 space-y-2 text-foreground/90">
              <li>Webhook node — trigger. Copy the webhook URL to Tasqr.</li>
              <li>
                Your processing nodes — HTTP Request to your AI API, any data
                transformation nodes.
              </li>
              <li>
                Respond to Webhook node — Set Response Body to JSON. Map the
                response object:
              </li>
            </ol>
            <CodeBlock code={N8N_EXAMPLE} />
            <P>
              Reference inputs as:{" "}
              <code className="font-mono text-sm" style={{ color: "#FFD600" }}>
                {"{{ $json.body.inputs.your_field_name }}"}
              </code>
            </P>
          </div>
        )}
        {tab === "pipedream" && (
          <div className="space-y-3">
            <P>Complete working Node.js step for Pipedream:</P>
            <CodeBlock code={PIPEDREAM_EXAMPLE} />
          </div>
        )}
        {tab === "python" && (
          <div className="space-y-3">
            <P>Complete working Flask endpoint:</P>
            <CodeBlock code={PYTHON_EXAMPLE} />
          </div>
        )}
      </div>
    </div>
  );
}

function OutputCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border border-border rounded-[4px] p-4 bg-[#1E293B]">
      <h3 className="font-mono text-base text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function MistakeCard({
  title,
  wrong,
  right,
}: {
  title: string;
  wrong: ReactNode;
  right: ReactNode;
}) {
  return (
    <div
      className="border border-border border-l-4 rounded-[4px] p-4 bg-[#1E293B]"
      style={{ borderLeftColor: "#F4511E" }}
    >
      <h3 className="font-mono text-base text-foreground mb-2">{title}</h3>
      <p className="text-sm text-foreground/90 mb-1">
        <span className="font-mono text-xs uppercase tracking-wider" style={{ color: "#F4511E" }}>
          Wrong:{" "}
        </span>
        {wrong}
      </p>
      <p className="text-sm text-foreground/90">
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Right:{" "}
        </span>
        {right}
      </p>
    </div>
  );
}

function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <header className="mb-8">
        <h1 className="font-mono text-3xl font-semibold tracking-tight text-foreground">
          Plugin Documentation
        </h1>
        <p className="mt-2 text-muted-foreground">
          Everything you need to connect your agent to Tasqr.
        </p>
      </header>

      {/* SECTION 1 */}
      <SectionLabel>Incoming Request</SectionLabel>
      <P>
        Every time a buyer runs your agent, Tasqr sends a POST request to your
        registered endpoint. Here is the exact payload:
      </P>
      <CodeBlock code={PAYLOAD_EXAMPLE} />
      <ul className="space-y-3 mt-4">
        <Note tone="yellow">
          <strong>inputs</strong> — Your buyer's form values live here, nested
          inside the inputs object. Reference them as{" "}
          <code className="font-mono">inputs.field_name</code> — NOT at the
          root level of the request. This is the most common integration
          mistake.
        </Note>
        <Note>
          <strong>files</strong> — File uploads live here separately from text
          inputs. These are temporary URLs that expire in 30 minutes. Fetch
          them immediately when your agent runs.
        </Note>
        <Note>
          <strong>api_key</strong> — Always verify this matches your stored key
          before processing. Reject any request where it doesn't match.
        </Note>
        <Note>
          <strong>timestamp</strong> — Reject requests older than 5 minutes to
          prevent replay attacks.
        </Note>
      </ul>

      {/* SECTION 2 */}
      <SectionLabel>Field Names</SectionLabel>
      <P>
        Your field labels in the Tasqr listing builder determine the exact key
        names used in the inputs object. Labels are automatically converted to
        lowercase with spaces replaced by underscores.
      </P>
      <Table
        headers={["Field Label", "Field Name in inputs"]}
        rows={[
          ["Product Name", "product_name"],
          ["Target Audience", "target_audience"],
          ["Upload Your File", "upload_your_file"],
          ["Company", "company"],
        ]}
      />
      <div
        className="p-4 rounded-[4px] border text-sm mb-3"
        style={{ borderColor: "#FFD600", color: "#FFD600" }}
      >
        Design your field labels to match the variable names your workflow
        already uses. A field labeled "Product Name" becomes{" "}
        <code className="font-mono">inputs.product_name</code> in the request
        payload.
      </div>
      <P>
        The field name is shown live below each label input when building your
        listing — use it to confirm the exact key before publishing.
      </P>

      {/* SECTION 3 */}
      <SectionLabel>Success Response</SectionLabel>
      <P>When your agent processes successfully, return this exact structure:</P>
      <CodeBlock code={SUCCESS_EXAMPLE} />
      <ul className="space-y-3 mt-4">
        <Note>
          <strong>tasqr_request_id</strong> — Echo back exactly what Tasqr
          sent. Missing or wrong ID = invalid response.
        </Note>
        <Note>
          <strong>output_type</strong> — Must match what you declared in your
          listing. Options: text, markdown, image_url, document_url.
        </Note>
        <Note>
          <strong>output</strong> — For text and markdown: the string content.
          For image_url and document_url: a URL to the file that must remain
          accessible for 72 hours.
        </Note>
        <Note>
          <strong>processing_time_ms</strong> — How long your agent took in
          milliseconds.
        </Note>
      </ul>

      {/* SECTION 4 */}
      <SectionLabel>Error Response</SectionLabel>
      <P>If something goes wrong, return this structure:</P>
      <CodeBlock code={ERROR_EXAMPLE} />
      <Table
        headers={["Error Code", "When to use", "Refund triggered"]}
        rows={[
          ["invalid_input", "Buyer provided bad data", "No"],
          ["content_policy_violation", "Input violates policy", "No"],
          ["external_service_failure", "Third party API failed", "Yes"],
          ["internal_error", "Unexpected failure", "Yes"],
        ]}
      />
      <P>
        Use <code className="font-mono">invalid_input</code> and{" "}
        <code className="font-mono">content_policy_violation</code> only when
        the fault is clearly the buyer's. Any other failure should be{" "}
        <code className="font-mono">internal_error</code> or{" "}
        <code className="font-mono">external_service_failure</code> — these
        trigger automatic refunds to protect buyer trust.
      </P>

      {/* SECTION 5 */}
      <SectionLabel>Output Types</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        <OutputCard
          title="text"
          desc="Return plain text content in the output field. Displayed as-is to the buyer."
        />
        <OutputCard
          title="markdown"
          desc="Return markdown-formatted text. Tasqr renders headers, lists, bold, code blocks, and all standard markdown."
        />
        <OutputCard
          title="image_url"
          desc="Return a URL pointing to an image file. Tasqr displays the image inline with a download button. URL must remain accessible for 72 hours."
        />
        <OutputCard
          title="document_url"
          desc="Return a URL pointing to a downloadable file. Tasqr shows a download button. URL must remain accessible for 72 hours."
        />
      </div>

      {/* SECTION 6 */}
      <SectionLabel>Timeouts</SectionLabel>
      <P>
        Declare your agent's processing time honestly when listing. Tasqr uses
        this to set buyer expectations and calculate the timeout window.
      </P>
      <Table
        headers={["Setting", "Declared time", "Timeout after"]}
        rows={[
          ["Fast", "Under 10 seconds", "40 seconds"],
          ["Medium", "10-30 seconds", "60 seconds"],
          ["Slow", "30s to 2 minutes", "2.5 minutes"],
        ]}
      />
      <P>
        Timeouts count against your reliability score. If your agent
        consistently times out, set a slower processing time or optimize your
        workflow.
      </P>

      {/* SECTION 7 */}
      <SectionLabel>Platform Examples</SectionLabel>
      <PlatformTabs />

      {/* SECTION 8 */}
      <SectionLabel>Common Mistakes</SectionLabel>
      <div className="space-y-3 mt-2">
        <MistakeCard
          title="Referencing inputs at root level"
          wrong={
            <>
              <code className="font-mono">inputs.product_name</code> referenced
              as <code className="font-mono">body.product_name</code>
            </>
          }
          right={
            <>
              Always use{" "}
              <code className="font-mono">body.inputs.product_name</code>
            </>
          }
        />
        <MistakeCard
          title="Missing tasqr_request_id in response"
          wrong="Returning output without echoing the request ID"
          right="Always echo back the exact tasqr_request_id from the incoming request"
        />
        <MistakeCard
          title="Sending plain text instead of JSON"
          wrong="Webhook Response body contains raw text or markdown directly"
          right="Always wrap in the full JSON response envelope"
        />
        <MistakeCard
          title="AI output wrapped in code fences"
          wrong={
            <>
              AI returns <code className="font-mono">```json {`{ ... }`} ```</code>
            </>
          }
          right={
            <>
              Add to system prompt: "Return only raw JSON, no code fences, no
              backticks"
            </>
          }
        />
        <MistakeCard
          title="Wrong output_type declared"
          wrong="Listing says markdown but agent returns image_url"
          right="output_type in response must match what was declared in listing"
        />
        <MistakeCard
          title="File URLs fetched too late"
          wrong="Fetching file URLs after processing other steps"
          right="Fetch file URLs immediately — they expire in 30 minutes"
        />
      </div>
    </div>
  );
}