import { memo, useMemo, useRef, useState } from "react";
import { GripVertical, Trash2, X, Plus } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/tasqr-button";
import { Input, Label, Select, Textarea } from "@/components/ui/tasqr-form";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type FieldType = "text" | "textarea" | "dropdown" | "image_upload" | "document_upload";

type BuilderField = {
  id: string;
  label: string;
  type: FieldType;
  placeholder: string;
  required: boolean;
  options: string[];
};

const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long Text" },
  { value: "dropdown", label: "Dropdown" },
  { value: "image_upload", label: "Image Upload" },
  { value: "document_upload", label: "Document Upload" },
];

function toFieldName(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function newField(): BuilderField {
  return {
    id: crypto.randomUUID(),
    label: "",
    type: "text",
    placeholder: "",
    required: true,
    options: [],
  };
}

function buildSchema(fields: BuilderField[]) {
  return fields.map((f) => {
    const base: Record<string, unknown> = {
      field_name: toFieldName(f.label) || `field_${f.id.slice(0, 4)}`,
      label: f.label,
      type: f.type,
      required: f.required,
    };
    if (f.type !== "image_upload" && f.type !== "document_upload") {
      base.placeholder = f.placeholder;
    }
    if (f.type === "dropdown") {
      base.options = f.options;
    }
    return base;
  });
}

function fieldError(f: BuilderField): string | null {
  if (!f.label.trim()) return "Label is required";
  if (f.type === "dropdown" && f.options.length < 2)
    return "Add at least 2 dropdown options";
  return null;
}

export function Step3InputBuilder({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [fields, setFields] = useState<BuilderField[]>([newField()]);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const schema = useMemo(() => buildSchema(fields), [fields]);

  const allValid =
    fields.length >= 1 && fields.every((f) => fieldError(f) === null);

  const update = (id: string, patch: Partial<BuilderField>) =>
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const remove = (id: string) => {
    if (!confirm("Remove this field?")) return;
    setFields((fs) => fs.filter((f) => f.id !== id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setFields((fs) => {
      const oldIdx = fs.findIndex((f) => f.id === active.id);
      const newIdx = fs.findIndex((f) => f.id === over.id);
      return arrayMove(fs, oldIdx, newIdx);
    });
  };

  const handleContinue = async () => {
    setTouched(true);
    if (!allValid || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from("seller_profiles")
      .update({ draft_input_schema: schema as never })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    onContinue();
  };

  return (
    <>
      <h2 className="font-mono text-[24px] mb-2">Define your agent's inputs</h2>
      <p className="font-sans text-sm text-muted-foreground mb-6">
        Tell Tasqr what information your agent needs from buyers. This builds the form
        they'll fill out before running your agent.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <div className="mb-4">
            <Button
              type="button"
              onClick={() => setFields((fs) => [...fs, newField()])}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Field
            </Button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {fields.map((f) => (
                  <FieldCard
                    key={f.id}
                    field={f}
                    error={touched ? fieldError(f) : null}
                    onChange={(patch) => update(f.id, patch)}
                    onRemove={() => remove(f.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {fields.length === 0 && (
            <p className="font-mono text-xs text-destructive mt-3">
              Add at least one field
            </p>
          )}
        </div>

        <PreviewPanel fields={fields} />
      </div>

      <div className="mt-8 flex gap-3">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          onClick={handleContinue}
          disabled={!allValid || saving}
          className="flex-1"
        >
          {saving ? "Saving..." : "Continue"}
        </Button>
      </div>
    </>
  );
}

function FieldCard({
  field,
  error,
  onChange,
  onRemove,
}: {
  field: BuilderField;
  error: string | null;
  onChange: (patch: Partial<BuilderField>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hidePlaceholder =
    field.type === "image_upload" || field.type === "document_upload";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-surface-raised border border-border rounded-[4px] p-4 flex gap-3"
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing pt-1"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Label>Field label</Label>
            <Input
              placeholder="e.g. Company Name"
              value={field.label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="mt-6 p-1.5 rounded-[4px] hover:bg-white/5"
            style={{ color: "#F4511E" }}
            aria-label="Delete field"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div>
          <Label>Field type</Label>
          <Select
            value={field.type}
            onChange={(e) =>
              onChange({ type: e.target.value as FieldType, options: [] })
            }
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {!hidePlaceholder && (
          <div>
            <Label>Placeholder text</Label>
            <Input
              placeholder="e.g. Enter your company name"
              value={field.placeholder}
              onChange={(e) => onChange({ placeholder: e.target.value })}
            />
          </div>
        )}

        {field.type === "dropdown" && (
          <DropdownOptionsEditor
            options={field.options}
            onChange={(options) => onChange({ options })}
          />
        )}

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          <span className="font-mono text-[12px] uppercase tracking-[0.05em] text-muted-foreground">
            Required
          </span>
        </label>

        {error && (
          <p className="font-mono text-xs" style={{ color: "#F4511E" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function DropdownOptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...options];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setDraft("");
  };

  return (
    <div>
      <Label>Dropdown options</Label>
      <div className="flex gap-2">
        <Input
          placeholder="Comma-separated, e.g. Professional, Casual"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
      </div>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {options.map((o) => (
            <span
              key={o}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] border border-border bg-background font-mono text-xs"
            >
              {o}
              <button
                type="button"
                onClick={() => onChange(options.filter((x) => x !== o))}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${o}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewPanel({ fields }: { fields: BuilderField[] }) {
  return (
    <div
      className="rounded-[4px] border p-5 h-fit lg:sticky lg:top-6"
      style={{ background: "#0B0E14", borderColor: "#334155" }}
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground mb-4">
        Buyer Preview
      </div>
      {fields.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground">
          Your form will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          {fields.map((f) => (
            <PreviewField key={f.id} field={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewField({ field }: { field: BuilderField }) {
  const label = field.label || "Untitled field";
  return (
    <div>
      <div className="font-mono text-[12px] uppercase tracking-[0.05em] text-muted-foreground mb-1.5">
        {label}
        {field.required && <span style={{ color: "#F4511E" }}> *</span>}
      </div>
      {field.type === "text" && (
        <Input placeholder={field.placeholder} disabled />
      )}
      {field.type === "textarea" && (
        <Textarea placeholder={field.placeholder} disabled />
      )}
      {field.type === "dropdown" && (
        <Select disabled defaultValue="">
          <option value="" disabled>
            {field.placeholder || "Select an option"}
          </option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      )}
      {(field.type === "image_upload" || field.type === "document_upload") && (
        <div className="border border-dashed border-border rounded-[4px] p-4 text-center font-sans text-xs text-muted-foreground">
          {field.type === "image_upload"
            ? "Upload an image"
            : "Upload a document"}
        </div>
      )}
    </div>
  );
}
