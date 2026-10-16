import { create } from "zustand";
import { toast } from "sonner";
import { evaluateCompatibilityRules } from "@/lib/compatibility/rule-evaluator";
import { evaluateWithCache, compatibilityCache } from "@/lib/compatibility/compatibility-cache";
import type {
  BuildComponentContext,
  CompatibilityEvaluationResult,
  CompatibilityRule,
  CompatibilityRuleBody,
} from "@/lib/compatibility/types";
import {
  createCompatibilityRule,
  deleteCompatibilityRule,
  fetchCompatibilityRules,
  updateCompatibilityRule,
} from "@/lib/api/compatibility-rules";
import { slugifyRuleCode } from "@/lib/mock-data/compatibility-rules";

type State = {
  rules: CompatibilityRule[];
  loading: boolean;
  loaded: boolean;
  fetchRules: () => Promise<void>;
  getRuleById: (id: string) => CompatibilityRule | undefined;
  listByConfigurator: (configuratorProfileId: string) => CompatibilityRule[];
  upsertRule: (
    data: Partial<CompatibilityRule> & {
      id?: string;
      name: string;
      configuratorProfileId: string;
      configuratorProfileName: string;
      body: CompatibilityRuleBody;
    },
  ) => Promise<string | null>;
  deleteRule: (id: string) => Promise<void>;
  duplicateRule: (id: string) => Promise<string | null>;
  evaluateBuild: (
    configuratorProfileId: string,
    components: BuildComponentContext[],
  ) => CompatibilityEvaluationResult;
  invalidateCache: (configuratorProfileId?: string) => void;
};

export const useCompatibilityRuleStore = create<State>()((set, get) => ({
  rules: [],
  loading: false,
  loaded: false,

  fetchRules: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const rules = await fetchCompatibilityRules();
      set({ rules, loading: false, loaded: true });
    } catch {
      set({ loading: false });
      toast.error("Could not load compatibility rules");
    }
  },

  getRuleById: (id) => get().rules.find((r) => r.id === id),

  listByConfigurator: (configuratorProfileId) =>
    get()
      .rules.filter((r) => r.configuratorProfileId === configuratorProfileId)
      .sort((a, b) => a.priority - b.priority),

  upsertRule: async (data) => {
    const existing = data.id ? get().rules.find((r) => r.id === data.id) : undefined;
    const input = {
      name: data.name,
      code: data.code ?? existing?.code ?? slugifyRuleCode(data.name),
      configuratorProfileId: data.configuratorProfileId,
      configuratorProfileName: data.configuratorProfileName,
      description: data.description ?? existing?.description,
      priority: data.priority ?? existing?.priority ?? 10,
      active: data.active ?? existing?.active ?? true,
      body: data.body,
    };

    try {
      const saved = existing
        ? await updateCompatibilityRule(existing.id, input)
        : await createCompatibilityRule(input);

      set((state) => ({
        rules: existing
          ? state.rules.map((r) => (r.id === saved.id ? saved : r))
          : [saved, ...state.rules],
      }));

      compatibilityCache.invalidate(data.configuratorProfileId);
      return saved.id;
    } catch {
      toast.error("Could not save compatibility rule");
      return null;
    }
  },

  deleteRule: async (id) => {
    const rule = get().rules.find((r) => r.id === id);
    try {
      await deleteCompatibilityRule(id);
      set((state) => ({ rules: state.rules.filter((r) => r.id !== id) }));
      if (rule) compatibilityCache.invalidate(rule.configuratorProfileId);
    } catch {
      toast.error("Could not delete compatibility rule");
    }
  },

  duplicateRule: async (id) => {
    const source = get().rules.find((r) => r.id === id);
    if (!source) return null;
    try {
      const copy = await createCompatibilityRule({
        name: `${source.name} (copy)`,
        code: `${source.code}_copy`,
        configuratorProfileId: source.configuratorProfileId,
        configuratorProfileName: source.configuratorProfileName,
        description: source.description,
        priority: source.priority,
        active: false,
        body: {
          ...source.body,
          conditions: source.body.conditions.map((c) => ({ ...c, id: `${c.id}_copy` })),
        },
      });
      set((state) => ({ rules: [copy, ...state.rules] }));
      return copy.id;
    } catch {
      toast.error("Could not duplicate compatibility rule");
      return null;
    }
  },

  evaluateBuild: (configuratorProfileId, components) => {
    return evaluateWithCache(configuratorProfileId, components, () =>
      evaluateCompatibilityRules(get().rules, components, configuratorProfileId),
    );
  },

  invalidateCache: (configuratorProfileId) => {
    compatibilityCache.invalidate(configuratorProfileId);
  },
}));
