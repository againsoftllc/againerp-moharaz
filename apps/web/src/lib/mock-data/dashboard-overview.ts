export const salesChartData = [
  { date: "Jun 1", sales: 42000, orders: 38 },
  { date: "Jun 2", sales: 38000, orders: 32 },
  { date: "Jun 3", sales: 51000, orders: 45 },
  { date: "Jun 4", sales: 47000, orders: 41 },
  { date: "Jun 5", sales: 62000, orders: 52 },
  { date: "Jun 6", sales: 55000, orders: 48 },
  { date: "Jun 7", sales: 71000, orders: 61 },
  { date: "Jun 8", sales: 68000, orders: 58 },
  { date: "Jun 9", sales: 59000, orders: 49 },
  { date: "Jun 10", sales: 74000, orders: 63 },
  { date: "Jun 11", sales: 82000, orders: 70 },
  { date: "Jun 12", sales: 76000, orders: 65 },
];

export const revenueByCategory = [
  { name: "Apparel", value: 34 },
  { name: "Electronics", value: 28 },
  { name: "Home", value: 18 },
  { name: "Beauty", value: 12 },
  { name: "Other", value: 8 },
];

export const kpiCards = [
  { label: "Today's Sales", value: "৳76,420", change: "+12.4%", up: true },
  { label: "Orders", value: "65", change: "+8.1%", up: true },
  { label: "Customers", value: "1,248", change: "+3.2%", up: true },
  { label: "Conversion", value: "3.8%", change: "-0.4%", up: false },
];

export const recentOrders = [
  { id: "ORD-01042", customer: "Rahim Ahmed", total: 2450, status: "processing" },
  { id: "ORD-01041", customer: "Sadia Khan", total: 8900, status: "shipped" },
  { id: "ORD-01040", customer: "Karim Hossain", total: 1200, status: "pending" },
  { id: "ORD-01039", customer: "Nusrat Jahan", total: 15600, status: "delivered" },
  { id: "ORD-01038", customer: "Tanvir Islam", total: 3200, status: "processing" },
];

export const inventoryAlerts = [
  { product: "Wireless Earbuds Pro", sku: "SKU-0002", stock: 8, threshold: 15 },
  { product: "Smart Watch Series 5", sku: "SKU-0005", stock: 3, threshold: 10 },
  { product: "USB-C Hub 7-in-1", sku: "SKU-0014", stock: 0, threshold: 5 },
];

export const aiInsights = [
  { title: "Restock recommendation", body: "3 products below safety stock. Suggested PO draft ready." },
  { title: "Price opportunity", body: "Electronics category trending +18% — consider flash sale." },
  { title: "SEO gap", body: "12 published products missing meta descriptions." },
];
