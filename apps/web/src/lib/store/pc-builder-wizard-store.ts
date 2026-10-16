import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiPcBuildResult } from "@/lib/builder/ai/types";
import type { BuilderMode, WizardAnswers, WizardSession, WizardStepId } from "@/lib/builder/wizard/types";
import { DEFAULT_WIZARD_ANSWERS } from "@/lib/builder/wizard/types";
import { getWizardFlow, nextWizardStep, prevWizardStep } from "@/lib/builder/wizard/question-engine";
import { recommendFromWizardAnswers } from "@/lib/builder/wizard/wizard-recommendation-service";
import { createLeadFromBuild } from "@/lib/configurator/erp/integration-service";
import { pcSelectionsToErpInput } from "@/lib/configurator/erp/build-to-erp";
import type { PcBuilderStepId } from "@/lib/builder/types";

type State = {
  mode: BuilderMode;
  sessionId: string | null;
  sessionCode: string | null;
  answers: WizardAnswers;
  currentStep: WizardStepId;
  recommendation: AiPcBuildResult | null;
  loading: boolean;
  sessions: WizardSession[];
  leadId: string | null;
  leadNumber: string | null;

  setMode: (mode: BuilderMode) => void;
  setAnswer: <K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) => void;
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: WizardStepId) => void;
  runRecommendation: () => Promise<AiPcBuildResult>;
  saveSession: () => WizardSession;
  createCrmLead: () => { leadId: string; leadNumber: string } | null;
  resetWizard: () => void;
  getFlow: () => ReturnType<typeof getWizardFlow>;
};

function sessionCode() {
  return `WIZ-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
}

export const usePcBuilderWizardStore = create<State>()(
  persist(
    (set, get) => ({
      mode: "wizard",
      sessionId: null,
      sessionCode: null,
      answers: { ...DEFAULT_WIZARD_ANSWERS },
      currentStep: "purpose",
      recommendation: null,
      loading: false,
      sessions: [],
      leadId: null,
      leadNumber: null,

      setMode: (mode) => set({ mode }),

      setAnswer: (key, value) => {
        set((s) => ({
          answers: { ...s.answers, [key]: value },
        }));
      },

      goNext: () => {
        const { answers, currentStep } = get();
        const next = nextWizardStep(answers, currentStep);
        set({ currentStep: next });
      },

      goBack: () => {
        const { answers, currentStep } = get();
        set({ currentStep: prevWizardStep(answers, currentStep) });
      },

      goToStep: (step) => set({ currentStep: step }),

      runRecommendation: async () => {
        set({ loading: true });
        try {
          const result = await recommendFromWizardAnswers(get().answers);
          set({ recommendation: result, currentStep: "complete", loading: false });
          return result;
        } catch (e) {
          set({ loading: false });
          throw e;
        }
      },

      saveSession: () => {
        const state = get();
        const id = state.sessionId ?? `wiz_${Date.now().toString(36)}`;
        const code = state.sessionCode ?? sessionCode();
        const session: WizardSession = {
          id,
          sessionCode: code,
          mode: state.mode,
          currentStep: state.currentStep,
          answers: state.answers,
          recommendation: state.recommendation,
          buildId: null,
          leadId: state.leadId,
          leadNumber: state.leadNumber,
          createdAt: now(),
          updatedAt: now(),
          completedAt: state.recommendation ? now() : null,
        };
        set((s) => ({
          sessionId: id,
          sessionCode: code,
          sessions: [session, ...s.sessions.filter((x) => x.id !== id)],
        }));
        return session;
      },

      createCrmLead: () => {
        const { answers, recommendation, sessionId, sessionCode } = get();
        if (!answers.contactName && !answers.contactEmail && !answers.contactPhone) return null;
        if (!recommendation || !sessionId) return null;

        const input = pcSelectionsToErpInput(
          sessionId,
          sessionCode ?? "WIZ-NEW",
          `${answers.purpose ?? "Custom"} Wizard Build`,
          recommendation.selections.map((s) => ({
            selectionId: `wiz_${s.productId}`,
            stepId: s.stepId as PcBuilderStepId,
            productId: s.productId,
            productName: s.productName,
            price: s.price,
            image: "",
            attributes: {},
            attributeProfileId: "",
          })),
          recommendation.totalPrice,
          recommendation.compatibilityStatus,
        );
        input.customerName = answers.contactName;
        input.customerEmail = answers.contactEmail;
        input.customerPhone = answers.contactPhone;

        const result = createLeadFromBuild(input);
        set({ leadId: result.lead?.id ?? null, leadNumber: result.lead?.leadNumber ?? null });
        return { leadId: result.lead?.id ?? "", leadNumber: result.lead?.leadNumber ?? "" };
      },

      resetWizard: () =>
        set({
          sessionId: null,
          sessionCode: null,
          answers: { ...DEFAULT_WIZARD_ANSWERS },
          currentStep: "purpose",
          recommendation: null,
          loading: false,
          leadId: null,
          leadNumber: null,
        }),

      getFlow: () => getWizardFlow(get().answers, get().currentStep),
    }),
    {
      name: "againerp-pc-builder-wizard",
      version: 1,
      partialize: (s) => ({
        mode: s.mode,
        sessionId: s.sessionId,
        sessionCode: s.sessionCode,
        answers: s.answers,
        currentStep: s.currentStep,
        recommendation: s.recommendation,
        sessions: s.sessions,
        leadId: s.leadId,
        leadNumber: s.leadNumber,
      }),
    },
  ),
);
