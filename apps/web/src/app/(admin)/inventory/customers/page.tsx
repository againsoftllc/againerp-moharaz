import { CustomersListScreen } from "@/components/customers/customers-list-screen";

/** Same customer list as /customers, shown under the Inventory module's own navbar. */
export default function InventoryCustomersPage() {
  return <CustomersListScreen chrome={false} />;
}
