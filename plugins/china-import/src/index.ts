/** Public API for againerp-plugin-china-import */

export { ChinaImportApp } from "./ChinaImportApp";
export type { ChinaImportAppProps } from "./ChinaImportApp";

export {
  CHINA_IMPORT_FEATURE_FLAG,
  CHINA_IMPORT_PLUGIN_ID,
  CHINA_IMPORT_PLUGIN_NAME,
  CHINA_IMPORT_PLUGIN_VERSION,
  DEFAULT_ELIM_BASE_URL,
  DEFAULT_SETTINGS,
  isChinaImportPluginEnabled,
  resolveApiBaseUrl,
  resolveRequestBaseUrl,
} from "./config";

export {
  connectionService,
  ConnectionService,
  toProviderConfig,
  normalizeSettings,
} from "./services/connection.service";

export {
  bootstrapProviderEngine,
  providerManager,
  providerRegistry,
  providerFactory,
  AbstractProvider,
} from "./core";

export type {
  BaseProvider,
  ProviderId,
  ProviderMeta,
  ProviderConfig,
  ProviderHealth,
  ProviderProduct,
  ProviderSearchResult,
} from "./core";

export {
  createElimClient,
  ElimClient,
  ElimHttpError,
  ElimProvider,
  searchProducts,
  findProduct,
  searchProductsByImage,
  listCategories,
  uploadImage,
  uploadAndSearchByImage,
  getApiLogs,
  clearApiLogs,
  appendApiLog,
} from "./providers/elim";

export { MockProvider } from "./providers/mock";

export {
  mapProduct,
  mapBrand,
  mapCategory,
  mapSupplier,
  mapImages,
  validateProduct,
  type MappingResult,
  type ValidationResult,
  type FieldTrace,
} from "./mapper";

export type {
  UniversalProduct,
  UniversalVariant,
  UniversalCategory,
  UniversalBrand,
  UniversalImage,
  UniversalAttribute,
  UniversalSupplier,
} from "./models";

export { MAPPING_FIXTURES, ELIM_SAMPLE_PRODUCT, MOCK_SAMPLE_PRODUCT } from "./fixtures/mapping-samples";

export {
  listStagingJobs,
  listStagingItems,
  createStagingJob,
  reviewStagingItem,
  bulkStagingAction,
  type StagingItem,
  type StagingJob,
} from "./api/staging";

export { useStagingQueue, useStagingItem, submitStagingJob } from "./hooks/use-staging";

export {
  listEntityMappings,
  scanUniversalMapping,
  scanItemMapping,
  type EntityMapping,
  type MappingDashboardMeta,
} from "./api/mapping";

export { useMappingDashboard } from "./hooks/use-mapping";

export type {
  MappingEntityType,
  MappingStatus,
  MatchMethod,
} from "./mapping/types";

export type * from "./types";
