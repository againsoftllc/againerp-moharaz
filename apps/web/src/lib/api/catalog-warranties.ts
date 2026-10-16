/** Raw warranty shape from FastAPI `/api/v1/catalog/warranties`. */
export type ApiCatalogWarranty = {
  id: string;
  company_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ApiWarrantyListResponse = {
  data: ApiCatalogWarranty[];
  meta: { count: number };
  errors: string[];
};

export type ApiWarrantyResponse = {
  data: ApiCatalogWarranty;
  errors: string[];
};
