/** Universal category — normalized tree node. */
export type UniversalCategory = {
  providerCategoryId: string;
  universalCategoryId: string;
  name: string;
  path: string[];
  level: number;
  parentId?: string | null;
};
