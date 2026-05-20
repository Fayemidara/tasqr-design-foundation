import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequireAuth, RequireSellerMode } from "@/components/auth/require-auth";
import { OnboardingLayout } from "@/components/layout/onboarding-layout";
import { Step3InputBuilder } from "@/components/seller/step3-input-builder";
import { Step4ConnectAgent, type Step4Data } from "@/components/seller/step4-connect-agent";
import { Step5Listing, type Step5Data } from "@/components/seller/step5-listing";
import { NewAgentReview } from "@/components/seller/new-agent-review";

const TOTAL_STEPS = 4;

export const Route = createFileRoute("/seller/agents/new")({
  head: () => ({ meta: [{ title: "List New Agent — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <RequireSellerMode>
        <NewAgentFlow />
      </RequireSellerMode>
    </RequireAuth>
  ),
});

function NewAgentFlow() {
  const [step, setStep] = useState(1);
  const [step4Data, setStep4Data] = useState<Step4Data | undefined>(undefined);
  const [step5Data, setStep5Data] = useState<Step5Data | undefined>(undefined);

  const isStep1 = step === 1;
  return (
    <OnboardingLayout
      step={step}
      totalSteps={TOTAL_STEPS}
      maxWidth={isStep1 ? 1100 : 600}
    >
      {step === 1 && (
        <Step3InputBuilder
          onContinue={() => setStep(2)}
          onBack={() => history.back()}
        />
      )}

      {step === 2 && (
        <Step4ConnectAgent
          initial={step4Data}
          onContinue={(data) => {
            setStep4Data(data);
            setStep(3);
          }}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <Step5Listing
          initial={step5Data}
          onContinue={(data) => {
            setStep5Data(data);
            setStep(4);
          }}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && step4Data && step5Data && (
        <NewAgentReview
          step4={step4Data}
          step5={step5Data}
          onEdit={(n) => setStep(n)}
          onBack={() => setStep(3)}
        />
      )}
    </OnboardingLayout>
  );
}
