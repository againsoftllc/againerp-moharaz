"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { evaluateBuildCompatibility } from "@/lib/builder/compatibility-filter";
import {
  getPhaseForStep,
  getStepsForPhase,
  PC_BUILDER_ASSEMBLY_SERVICE,
  type PcBuilderPhaseId,
} from "@/lib/builder/phases";
import type {
  PcBuilderSavedBuild,
  PcBuilderSelection,
  PcBuilderStepId,
} from "@/lib/builder/types";
import { PC_BUILDER_STEPS, stepAllowsMultiple } from "@/lib/builder/types";
import { getPcProductById } from "@/lib/mock-data/pc-builder-products";
import { getPcBuildPresetById } from "@/lib/mock-data/pc-builder-presets";
import { compatibilityRulesSeed } from "@/lib/mock-data/compatibility-rules";

type State = {
  currentPhase: PcBuilderPhaseId;
  currentStep: PcBuilderStepId;
  selections: PcBuilderSelection[];
  compareByStep: Partial<Record<PcBuilderStepId, string[]>>;
  savedBuilds: PcBuilderSavedBuild[];
  buildName: string;
  shareToken: string | null;
  assemblyEnabled: boolean;

  setPhase: (phase: PcBuilderPhaseId) => void;
  setStep: (step: PcBuilderStepId) => void;
  nextStep: () => void;
  prevStep: () => void;
  selectProduct: (stepId: PcBuilderStepId, productId: string) => void;
  addProduct: (stepId: PcBuilderStepId, productId: string) => void;
  removeSelection: (selectionId: string) => void;
  clearStep: (stepId: PcBuilderStepId) => void;
  getSelection: (stepId: PcBuilderStepId) => PcBuilderSelection | undefined;
  getSelectionsForStep: (stepId: PcBuilderStepId) => PcBuilderSelection[];
  isProductSelected: (stepId: PcBuilderStepId, productId: string) => boolean;
  totalPrice: () => number;
  compatibilityStatus: () => "compatible" | "warning" | "incompatible";
  compatibilityDetails: () => ReturnType<typeof evaluateBuildCompatibility>;
  toggleCompare: (stepId: PcBuilderStepId, productId: string) => void;
  setBuildName: (name: string) => void;
  saveBuild: () => PcBuilderSavedBuild;
  loadFromShareToken: (token: string) => boolean;
  encodeShareUrl: () => string;
  hydrateFromEncoded: (encoded: string) => boolean;
  resetBuild: () => void;
  applyAiBuild: (productIds: { stepId: PcBuilderStepId; productId: string }[]) => void;
  loadPreset: (presetId: string) => boolean;
  loadFromSelectionIds: (ids: string[]) => boolean;
  encodeSelectionsUrl: () => string;
  toggleAssembly: () => void;
};

function generateBuildCode() {
  return `PC-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function newSelectionId() {
  return `sel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function generateShareToken(selections: PcBuilderSelection[]) {
  const payload = selections.map((s) => ({ s: s.stepId, p: s.productId, i: s.selectionId }));
  return btoa(JSON.stringify(payload));
}

function decodeShareToken(token: string): { s: PcBuilderStepId; p: string; i?: string }[] | null {
  try {
    return JSON.parse(atob(token));
  } catch {
    return null;
  }
}

function productToSelection(stepId: PcBuilderStepId, productId: string): PcBuilderSelection | null {
  const product = getPcProductById(productId);
  if (!product) return null;
  return {
    selectionId: newSelectionId(),
    stepId,
    productId: product.id,
    productName: product.name,
    price: product.price,
    image: product.image,
    attributes: product.attributes,
    attributeProfileId: product.attributeProfileId,
  };
}

export const usePcBuilderStore = create<State>()(
  persist(
    (set, get) => ({
      currentPhase: "components",
      currentStep: "cpu",
      selections: [],
      compareByStep: {},
      savedBuilds: [],
      buildName: "My PC Build",
      shareToken: null,
      assemblyEnabled: false,

      setPhase: (phase) => {
        if (phase === "overview") {
          set({ currentPhase: phase });
          return;
        }
        const steps = getStepsForPhase(phase);
        set({ currentPhase: phase, currentStep: steps[0]?.id ?? get().currentStep });
      },

      setStep: (step) => set({ currentStep: step, currentPhase: getPhaseForStep(step) }),

      nextStep: () => {
        const phase = getPhaseForStep(get().currentStep);
        const steps = getStepsForPhase(phase);
        const idx = steps.findIndex((s) => s.id === get().currentStep);
        if (idx < steps.length - 1) {
          set({ currentStep: steps[idx + 1].id });
        }
      },

      prevStep: () => {
        const phase = getPhaseForStep(get().currentStep);
        const steps = getStepsForPhase(phase);
        const idx = steps.findIndex((s) => s.id === get().currentStep);
        if (idx > 0) {
          set({ currentStep: steps[idx - 1].id });
        }
      },

      addProduct: (stepId, productId) => {
        const selection = productToSelection(stepId, productId);
        if (!selection) return;
        set((state) => ({
          selections: [...state.selections, selection],
          shareToken: null,
        }));
      },

      selectProduct: (stepId, productId) => {
        if (stepAllowsMultiple(stepId)) {
          get().addProduct(stepId, productId);
          return;
        }

        const selection = productToSelection(stepId, productId);
        if (!selection) return;

        set((state) => ({
          selections: [
            ...state.selections.filter((s) => s.stepId !== stepId),
            selection,
          ],
          shareToken: null,
        }));
      },

      removeSelection: (selectionId) => {
        set((state) => ({
          selections: state.selections.filter((s) => s.selectionId !== selectionId),
          shareToken: null,
        }));
      },

      clearStep: (stepId) => {
        set((state) => ({
          selections: state.selections.filter((s) => s.stepId !== stepId),
          shareToken: null,
        }));
      },

      getSelection: (stepId) => get().selections.find((s) => s.stepId === stepId),

      getSelectionsForStep: (stepId) => get().selections.filter((s) => s.stepId === stepId),

      isProductSelected: (stepId, productId) =>
        get().selections.some((s) => s.stepId === stepId && s.productId === productId),

      totalPrice: () => {
        const parts = get().selections.reduce((sum, s) => sum + s.price, 0);
        return parts + (get().assemblyEnabled ? PC_BUILDER_ASSEMBLY_SERVICE.price : 0);
      },

      compatibilityStatus: () => get().compatibilityDetails().status,

      compatibilityDetails: () =>
        evaluateBuildCompatibility(get().selections, compatibilityRulesSeed),

      toggleCompare: (stepId, productId) => {
        set((state) => {
          const current = state.compareByStep[stepId] ?? [];
          const exists = current.includes(productId);
          const next = exists
            ? current.filter((id) => id !== productId)
            : current.length < 3
              ? [...current, productId]
              : current;
          return { compareByStep: { ...state.compareByStep, [stepId]: next } };
        });
      },

      setBuildName: (name) => set({ buildName: name }),

      saveBuild: () => {
        const state = get();
        const build: PcBuilderSavedBuild = {
          id: `sb_${Date.now().toString(36)}`,
          buildCode: generateBuildCode(),
          name: state.buildName,
          selections: state.selections,
          totalPrice: state.totalPrice(),
          compatibilityStatus: state.compatibilityStatus(),
          createdAt: new Date().toISOString(),
          shareToken: generateShareToken(state.selections),
        };
        set((s) => ({
          savedBuilds: [build, ...s.savedBuilds],
          shareToken: build.shareToken,
        }));
        return build;
      },

      loadFromShareToken: (token) => {
        const decoded = decodeShareToken(token);
        if (!decoded) return false;
        const selections: PcBuilderSelection[] = [];
        for (const item of decoded) {
          const product = getPcProductById(item.p);
          if (!product) continue;
          selections.push({
            selectionId: item.i ?? newSelectionId(),
            stepId: item.s,
            productId: product.id,
            productName: product.name,
            price: product.price,
            image: product.image,
            attributes: product.attributes,
            attributeProfileId: product.attributeProfileId,
          });
        }
        set({ selections, shareToken: token });
        return selections.length > 0;
      },

      encodeShareUrl: () => {
        const token = generateShareToken(get().selections);
        set({ shareToken: token });
        return token;
      },

      hydrateFromEncoded: (encoded) => get().loadFromShareToken(encoded),

      resetBuild: () =>
        set({
          currentPhase: "components",
          currentStep: "cpu",
          selections: [],
          compareByStep: {},
          buildName: "My PC Build",
          shareToken: null,
          assemblyEnabled: false,
        }),

      applyAiBuild: (productIds) => {
        const selections: PcBuilderSelection[] = [];
        for (const { stepId, productId } of productIds) {
          const sel = productToSelection(stepId, productId);
          if (!sel) continue;
          if (stepAllowsMultiple(stepId)) {
            selections.push(sel);
          } else if (!selections.some((s) => s.stepId === stepId)) {
            selections.push(sel);
          }
        }
        set({ selections, shareToken: null, currentStep: "cpu", currentPhase: "components" });
      },

      loadPreset: (presetId) => {
        const preset = getPcBuildPresetById(presetId);
        if (!preset) return false;

        const selections: PcBuilderSelection[] = [];
        for (const step of PC_BUILDER_STEPS) {
          const productId = preset.picks[step.id];
          if (!productId) continue;
          const sel = productToSelection(step.id, productId);
          if (sel) selections.push(sel);
        }

        if (selections.length === 0) return false;

        set({
          selections,
          buildName: preset.name,
          shareToken: null,
          currentStep: "cpu",
          currentPhase: "components",
        });
        return true;
      },

      loadFromSelectionIds: (ids) => {
        const selections: PcBuilderSelection[] = [];
        for (const rawId of ids) {
          const productId = rawId.trim();
          if (!productId) continue;
          const product = getPcProductById(productId);
          if (!product) continue;
          selections.push({
            selectionId: newSelectionId(),
            stepId: product.stepId,
            productId: product.id,
            productName: product.name,
            price: product.price,
            image: product.image,
            attributes: product.attributes,
            attributeProfileId: product.attributeProfileId,
          });
        }
        if (selections.length === 0) return false;
        set({ selections, shareToken: null, currentStep: "cpu", currentPhase: "components" });
        return true;
      },

      encodeSelectionsUrl: () => {
        const ids = get().selections.map((s) => s.productId).join(",");
        set({ shareToken: null });
        return ids;
      },

      toggleAssembly: () => set((s) => ({ assemblyEnabled: !s.assemblyEnabled })),
    }),
    {
      name: "againerp-pc-builder",
      version: 3,
      migrate: (persisted: unknown, version) => {
        if (version < 2 && persisted && typeof persisted === "object" && "selections" in persisted) {
          const state = persisted as { selections: PcBuilderSelection[] };
          state.selections = (state.selections ?? []).map((s) => ({
            ...s,
            selectionId: s.selectionId ?? newSelectionId(),
          }));
        }
        if (version < 3 && persisted && typeof persisted === "object") {
          const state = persisted as Partial<State>;
          state.currentPhase = state.currentPhase ?? "components";
          state.assemblyEnabled = state.assemblyEnabled ?? false;
        }
        return persisted as State;
      },
      partialize: (s) => ({
        selections: s.selections,
        savedBuilds: s.savedBuilds,
        buildName: s.buildName,
        currentStep: s.currentStep,
        currentPhase: s.currentPhase,
        assemblyEnabled: s.assemblyEnabled,
        compareByStep: s.compareByStep,
      }),
    },
  ),
);
