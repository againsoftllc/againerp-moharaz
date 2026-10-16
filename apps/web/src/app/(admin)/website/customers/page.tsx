import { CustomersListScreen } from "@/components/customers/customers-list-screen";

/** Same customer list as /customers, shown under the Website module's own navbar. */
export default function WebsiteCustomersPage() {
  return <CustomersListScreen chrome={false} />;
}
