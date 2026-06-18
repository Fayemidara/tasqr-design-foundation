import { useMemo, useState } from "react";
import { Button } from "@/components/ui/tasqr-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  InputFieldsBuilder,
  buildSchema,
  fieldError,
  makeField,
  useFieldIdFactory,
  type BuilderField,
} from "./input-fields-builder";

export function Step3InputBuilder({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { nextId } = useFieldIdFactory();
  const [fields, setFields] = useState<BuilderField[]>(() => [makeField(nextId())]);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const schema = useMemo(() => buildSchema(fields), [fields]);

  const allValid =
    fields.length >= 1 && fields.every((f) => fieldError(f) === null);

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

      <InputFieldsBuilder
        fields={fields}
        setFields={setFields}
        nextId={nextId}
        touched={touched}
      />

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
