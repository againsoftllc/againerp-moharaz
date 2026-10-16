/** Configurator ↔ ERP integration types */

export type ErpFunnelStage =
  | "saved"
  | "lead"
  | "quotation"
  | "sales_order"
  | "invoice"
  | "completed";

export type ErpWorkflowStep = "lead" | "quotation" | "sales_order" | "invoice";

export type ErpContactInput = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
};

export type ErpLineItem = {
  productId?: string;
  sku?: string;
  name: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type BuildErpLinks = {
  funnelStage: ErpFunnelStage;
  leadId?: string;
  leadNumber?: string;
  quotationId?: string;
  quotationNumber?: string;
  salesOrderId?: string;
  orderNumber?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  stockReserved?: boolean;
  events: { step: string; at: string; actorId?: number }[];
};

export type CrmLead = {
  id: string;
  leadNumber: string;
  buildId: string;
  buildCode: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  source: string;
  stage: string;
  estimatedValue?: number;
  assignedTo?: string;
  createdAt: string;
};

export type SalesQuotation = {
  id: string;
  quotationNumber: string;
  buildId: string;
  buildCode: string;
  leadId?: string;
  customerName: string;
  status: string;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  validUntil?: string;
  lines: ErpLineItem[];
  createdAt: string;
};

export type ErpSalesOrder = {
  id: string;
  orderNumber: string;
  buildId: string;
  buildCode: string;
  quotationId?: string;
  leadId?: string;
  customerName: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  grandTotal: number;
  stockReserved: boolean;
  lines: ErpLineItem[];
  createdAt: string;
};

export type ErpInvoice = {
  id: string;
  invoiceNumber: string;
  buildId: string;
  salesOrderId: string;
  orderNumber: string;
  customerName: string;
  status: string;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  dueDate?: string;
  lines: ErpLineItem[];
  createdAt: string;
};

export type ErpStockCheck = {
  productId: string;
  name: string;
  requested: number;
  available: number;
  sufficient: boolean;
};

export type ErpIntegrationResult = {
  buildId: string;
  buildCode: string;
  funnelStage: ErpFunnelStage;
  links: BuildErpLinks;
  lead?: CrmLead;
  quotation?: SalesQuotation;
  salesOrder?: ErpSalesOrder;
  invoice?: ErpInvoice;
  stockChecks?: ErpStockCheck[];
  warnings?: string[];
};

export type ErpBuildInput = {
  buildId: string;
  buildCode: string;
  name: string;
  profileName?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  components: {
    categoryName: string;
    productId?: string;
    productName?: string;
    quantity: number;
    unitPrice?: number;
    image?: string;
    sku?: string;
  }[];
  totalPrice: number;
  compatibilityStatus: "compatible" | "warning" | "incompatible";
};

export type ErpAnalyticsFunnel = {
  savedBuilds: number;
  leadsCreated: number;
  quotationsSent: number;
  ordersConfirmed: number;
  invoicesPosted: number;
  conversionRate: number;
  avgBuildValue: number;
  totalPipelineValue: number;
};

export type ErpAnalytics = {
  funnel: ErpAnalyticsFunnel;
  topProfiles: { profileType: string; buildCount: number; orderCount: number; revenue: number }[];
  recentEvents: { step: string; at: string; buildCode: string; buildId: string }[];
};

export const ERP_FUNNEL_LABELS: Record<ErpFunnelStage, string> = {
  saved: "Saved",
  lead: "Lead",
  quotation: "Quotation",
  sales_order: "Sales Order",
  invoice: "Invoice",
  completed: "Completed",
};
