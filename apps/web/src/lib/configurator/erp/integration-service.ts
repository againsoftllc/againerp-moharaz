import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  BuildErpLinks,
  CrmLead,
  ErpAnalytics,
  ErpBuildInput,
  ErpFunnelStage,
  ErpIntegrationResult,
  ErpInvoice,
  ErpSalesOrder,
  ErpWorkflowStep,
  SalesQuotation,
} from "@/lib/configurator/erp/types";
import { logConfiguratorActivity } from "@/lib/configurator/audit";
import { getPcProductById } from "@/lib/mock-data/pc-builder-products";

type State = {
  linksByBuildId: Record<string, BuildErpLinks>;
  leads: CrmLead[];
  quotations: SalesQuotation[];
  erpOrders: ErpSalesOrder[];
  invoices: ErpInvoice[];
  getLinks: (buildId: string) => BuildErpLinks | undefined;
  setLinks: (buildId: string, links: BuildErpLinks) => void;
};

function docNumber(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function defaultLinks(): BuildErpLinks {
  return { funnelStage: "saved", events: [] };
}

function calcTotals(lines: { quantity: number; unitPrice: number }[], taxRate = 5, shipping = 0) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const grandTotal = subtotal + taxAmount + shipping;
  return { subtotal, taxAmount, grandTotal };
}

function checkStock(input: ErpBuildInput) {
  return input.components
    .filter((c) => c.productId)
    .map((c) => {
      const product = getPcProductById(c.productId!);
      const available = product?.stock ?? 0;
      return {
        productId: c.productId!,
        name: c.productName ?? c.categoryName,
        requested: c.quantity,
        available,
        sufficient: available >= c.quantity,
      };
    });
}

export const useConfiguratorErpStore = create<State>()(
  persist(
    (set, get) => ({
      linksByBuildId: {},
      leads: [],
      quotations: [],
      erpOrders: [],
      invoices: [],

      getLinks: (buildId) => get().linksByBuildId[buildId],
      setLinks: (buildId, links) =>
        set((s) => ({ linksByBuildId: { ...s.linksByBuildId, [buildId]: links } })),
    }),
    { name: "againerp-configurator-erp", version: 1 },
  ),
);

function appendEvent(links: BuildErpLinks, step: string): BuildErpLinks {
  return {
    ...links,
    events: [{ step, at: nowIso() }, ...links.events],
  };
}

function createLeadRecord(input: ErpBuildInput, links: BuildErpLinks): { lead: CrmLead; links: BuildErpLinks } {
  const lead: CrmLead = {
    id: `lead_${Date.now().toString(36)}`,
    leadNumber: docNumber("LEAD"),
    buildId: input.buildId,
    buildCode: input.buildCode,
    contactName: input.customerName ?? input.name,
    contactEmail: input.customerEmail,
    contactPhone: input.customerPhone,
    source: "pc_builder",
    stage: "new",
    estimatedValue: input.totalPrice,
    assignedTo: "Sales Team",
    createdAt: nowIso(),
  };
  const next = appendEvent(
    {
      ...links,
      funnelStage: "lead",
      leadId: lead.id,
      leadNumber: lead.leadNumber,
    },
    "lead",
  );
  return { lead, links: next };
}

function createQuotationRecord(
  input: ErpBuildInput,
  links: BuildErpLinks,
): { quotation: SalesQuotation; links: BuildErpLinks } {
  const lines = input.components
    .filter((c) => c.productName)
    .map((c) => ({
      productId: c.productId,
      sku: c.sku,
      name: c.productName!,
      category: c.categoryName,
      quantity: c.quantity,
      unitPrice: c.unitPrice ?? 0,
      lineTotal: (c.unitPrice ?? 0) * c.quantity,
    }));
  const { subtotal, taxAmount, grandTotal } = calcTotals(
    lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
  );
  const quotation: SalesQuotation = {
    id: `quo_${Date.now().toString(36)}`,
    quotationNumber: docNumber("QUO"),
    buildId: input.buildId,
    buildCode: input.buildCode,
    leadId: links.leadId,
    customerName: input.customerName ?? input.name,
    status: "sent",
    subtotal,
    taxAmount,
    grandTotal,
    validUntil: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    lines,
    createdAt: nowIso(),
  };
  const next = appendEvent(
    {
      ...links,
      funnelStage: "quotation",
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
    },
    "quotation",
  );
  return { quotation, links: next };
}

function createErpOrderRecord(
  input: ErpBuildInput,
  links: BuildErpLinks,
  shipping = 120,
): { salesOrder: ErpSalesOrder; links: BuildErpLinks } {
  const lines = input.components
    .filter((c) => c.productName)
    .map((c) => ({
      productId: c.productId,
      sku: c.sku,
      name: c.productName!,
      category: c.categoryName,
      quantity: c.quantity,
      unitPrice: c.unitPrice ?? 0,
      lineTotal: (c.unitPrice ?? 0) * c.quantity,
    }));
  const { subtotal, taxAmount, grandTotal } = calcTotals(
    lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
    5,
    shipping,
  );
  const salesOrder: ErpSalesOrder = {
    id: `so_${Date.now().toString(36)}`,
    orderNumber: docNumber("SO"),
    buildId: input.buildId,
    buildCode: input.buildCode,
    quotationId: links.quotationId,
    leadId: links.leadId,
    customerName: input.customerName ?? input.name,
    status: "confirmed",
    paymentStatus: "unpaid",
    subtotal,
    taxAmount,
    shippingAmount: shipping,
    grandTotal,
    stockReserved: true,
    lines,
    createdAt: nowIso(),
  };
  const next = appendEvent(
    {
      ...links,
      funnelStage: "sales_order",
      salesOrderId: salesOrder.id,
      orderNumber: salesOrder.orderNumber,
      stockReserved: true,
    },
    "sales_order",
  );
  return { salesOrder, links: next };
}

function createInvoiceRecord(
  input: ErpBuildInput,
  links: BuildErpLinks,
): { invoice: ErpInvoice; links: BuildErpLinks } {
  const lines = input.components
    .filter((c) => c.productName)
    .map((c) => ({
      productId: c.productId,
      sku: c.sku,
      name: c.productName!,
      category: c.categoryName,
      quantity: c.quantity,
      unitPrice: c.unitPrice ?? 0,
      lineTotal: (c.unitPrice ?? 0) * c.quantity,
    }));
  const { subtotal, taxAmount, grandTotal } = calcTotals(
    lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
  );
  const invoice: ErpInvoice = {
    id: `inv_${Date.now().toString(36)}`,
    invoiceNumber: docNumber("INV"),
    buildId: input.buildId,
    salesOrderId: links.salesOrderId ?? "",
    orderNumber: links.orderNumber ?? "",
    customerName: input.customerName ?? input.name,
    status: "posted",
    subtotal,
    taxAmount,
    grandTotal,
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    lines,
    createdAt: nowIso(),
  };
  const next = appendEvent(
    {
      ...links,
      funnelStage: "completed",
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    },
    "invoice",
  );
  return { invoice, links: next };
}

/** Local ERP order id only — Sales 2 commerce order store removed. */
function syncCommerceOrder(_input: ErpBuildInput, erpOrder: ErpSalesOrder): string {
  return erpOrder.id;
}

export function createLeadFromBuild(input: ErpBuildInput): ErpIntegrationResult {
  const store = useConfiguratorErpStore.getState();
  const existing = store.getLinks(input.buildId) ?? defaultLinks();
  if (existing.leadId) throw new Error("Lead already exists for this build");

  const { lead, links } = createLeadRecord(input, existing);
  store.setLinks(input.buildId, links);
  useConfiguratorErpStore.setState((s) => ({ leads: [lead, ...s.leads] }));
  logConfiguratorActivity("configurator_build", input.buildId, "create", `CRM lead ${lead.leadNumber} created`);

  return { buildId: input.buildId, buildCode: input.buildCode, funnelStage: "lead", links, lead };
}

export function createQuotationFromBuild(input: ErpBuildInput): ErpIntegrationResult {
  const store = useConfiguratorErpStore.getState();
  let links = store.getLinks(input.buildId) ?? defaultLinks();
  let lead: CrmLead | undefined;

  if (!links.leadId) {
    const leadResult = createLeadFromBuild(input);
    links = leadResult.links;
    lead = leadResult.lead;
  } else {
    lead = store.leads.find((l) => l.id === links.leadId);
  }
  if (links.quotationId) throw new Error("Quotation already exists for this build");

  const { quotation, links: next } = createQuotationRecord(input, links);
  store.setLinks(input.buildId, next);
  useConfiguratorErpStore.setState((s) => ({ quotations: [quotation, ...s.quotations] }));
  logConfiguratorActivity("configurator_build", input.buildId, "create", `Quotation ${quotation.quotationNumber} created`);

  return {
    buildId: input.buildId,
    buildCode: input.buildCode,
    funnelStage: "quotation",
    links: next,
    lead,
    quotation,
  };
}

export function createSalesOrderFromBuild(input: ErpBuildInput): ErpIntegrationResult {
  const store = useConfiguratorErpStore.getState();
  let links = store.getLinks(input.buildId) ?? defaultLinks();
  let quotation: SalesQuotation | undefined;
  let lead: CrmLead | undefined;
  const warnings: string[] = [];

  if (!links.quotationId) {
    const quoResult = createQuotationFromBuild(input);
    links = quoResult.links;
    quotation = quoResult.quotation;
    lead = quoResult.lead;
  } else {
    quotation = store.quotations.find((q) => q.id === links.quotationId);
    lead = store.leads.find((l) => l.id === links.leadId);
  }
  if (links.salesOrderId) throw new Error("Sales order already exists for this build");

  const stockChecks = checkStock(input);
  const insufficient = stockChecks.filter((c) => !c.sufficient);
  if (insufficient.length > 0) {
    throw new Error(`Insufficient stock: ${insufficient.map((c) => c.name).join(", ")}`);
  }
  if (stockChecks.some((c) => c.available < c.requested + 3)) {
    warnings.push("Some items are low stock after reservation");
  }

  const { salesOrder, links: next } = createErpOrderRecord(input, links);
  const commerceOrderId = syncCommerceOrder(input, salesOrder);
  const linked = {
    ...next,
    salesOrderId: commerceOrderId,
    orderNumber: salesOrder.orderNumber,
  };
  store.setLinks(input.buildId, linked);
  useConfiguratorErpStore.setState((s) => ({
    erpOrders: [{ ...salesOrder, id: commerceOrderId }, ...s.erpOrders],
  }));
  logConfiguratorActivity("configurator_build", input.buildId, "create", `Sales order ${salesOrder.orderNumber} created`);

  return {
    buildId: input.buildId,
    buildCode: input.buildCode,
    funnelStage: "sales_order",
    links: linked,
    lead,
    quotation,
    salesOrder: { ...salesOrder, id: commerceOrderId },
    stockChecks,
    warnings,
  };
}

export function createInvoiceFromBuild(input: ErpBuildInput): ErpIntegrationResult {
  const store = useConfiguratorErpStore.getState();
  let links = store.getLinks(input.buildId) ?? defaultLinks();
  let salesOrder: ErpSalesOrder | undefined;

  if (!links.salesOrderId) {
    const orderResult = createSalesOrderFromBuild(input);
    links = orderResult.links;
    salesOrder = orderResult.salesOrder;
  } else {
    salesOrder = store.erpOrders.find((o) => o.id === links.salesOrderId);
  }
  if (links.invoiceId) throw new Error("Invoice already exists for this build");

  const { invoice, links: next } = createInvoiceRecord(input, links);
  store.setLinks(input.buildId, next);
  useConfiguratorErpStore.setState((s) => ({ invoices: [invoice, ...s.invoices] }));
  logConfiguratorActivity("configurator_build", input.buildId, "create", `Invoice ${invoice.invoiceNumber} posted`);

  return {
    buildId: input.buildId,
    buildCode: input.buildCode,
    funnelStage: "completed",
    links: next,
    salesOrder,
    invoice,
  };
}

export function runErpWorkflow(
  input: ErpBuildInput,
  steps: ErpWorkflowStep[] = ["lead", "quotation", "sales_order", "invoice"],
): ErpIntegrationResult {
  const handlers: Record<ErpWorkflowStep, (i: ErpBuildInput) => ErpIntegrationResult> = {
    lead: createLeadFromBuild,
    quotation: createQuotationFromBuild,
    sales_order: createSalesOrderFromBuild,
    invoice: createInvoiceFromBuild,
  };

  let result: ErpIntegrationResult | null = null;
  for (const step of steps) {
    try {
      result = handlers[step](input);
    } catch (e) {
      if (e instanceof Error && e.message.includes("already exists")) continue;
      throw e;
    }
  }
  if (!result) {
    const links = useConfiguratorErpStore.getState().getLinks(input.buildId) ?? defaultLinks();
    return { buildId: input.buildId, buildCode: input.buildCode, funnelStage: links.funnelStage, links };
  }
  return result;
}

export function computeErpAnalytics(
  buildIds: string[],
  buildValues: Record<string, number>,
): ErpAnalytics {
  const store = useConfiguratorErpStore.getState();
  const saved = buildIds.length;
  let leads = 0;
  let quotations = 0;
  let orders = 0;
  let invoices = 0;
  let totalValue = 0;
  const events: ErpAnalytics["recentEvents"] = [];

  for (const id of buildIds) {
    const links = store.linksByBuildId[id];
    const value = buildValues[id] ?? 0;
    totalValue += value;
    if (!links) continue;
    if (links.leadId) leads += 1;
    if (links.quotationId) quotations += 1;
    if (links.salesOrderId) orders += 1;
    if (links.invoiceId) invoices += 1;
    for (const ev of links.events.slice(0, 2)) {
      events.push({
        step: ev.step,
        at: ev.at,
        buildCode: store.leads.find((l) => l.buildId === id)?.buildCode ?? id,
        buildId: id,
      });
    }
  }

  events.sort((a, b) => b.at.localeCompare(a.at));

  return {
    funnel: {
      savedBuilds: saved,
      leadsCreated: leads,
      quotationsSent: quotations,
      ordersConfirmed: orders,
      invoicesPosted: invoices,
      conversionRate: saved ? Math.round((orders / saved) * 1000) / 10 : 0,
      avgBuildValue: saved ? Math.round(totalValue / saved) : 0,
      totalPipelineValue: totalValue,
    },
    topProfiles: [{ profileType: "pc_builder", buildCount: saved, orderCount: orders, revenue: totalValue }],
    recentEvents: events.slice(0, 10),
  };
}

export function getFunnelStage(buildId: string): ErpFunnelStage {
  return useConfiguratorErpStore.getState().getLinks(buildId)?.funnelStage ?? "saved";
}
