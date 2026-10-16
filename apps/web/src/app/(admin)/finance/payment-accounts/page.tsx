"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeftRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PaymentAccountDrawer } from "@/components/finance/payment-account-drawer";
import { PaymentAccountTransferDrawer } from "@/components/finance/payment-account-transfer-drawer";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import {
  createPaymentAccount,
  fetchPaymentAccounts,
  transferPaymentAccounts,
  updatePaymentAccount,
  type ApiFinancePaymentAccount,
} from "@/lib/api/finance";
import type { PaymentAccountGridHandle } from "@/components/finance/payment-account-grid";
import { formatMoney } from "@/lib/utils";

const PaymentAccountGrid = dynamic(
  () => import("@/components/finance/payment-account-grid").then((module) => module.PaymentAccountGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening payment accounts…" />,
  },
);

function money(value: number) {
  return formatMoney(value);
}

export default function FinancePaymentAccountsPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<PaymentAccountGridHandle>(null);
  const [accounts, setAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFromId, setTransferFromId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPaymentAccounts();
      setAccounts(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payment accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "finance-payment-accounts-api" });
  }, [error]);

  const totalBalance = accounts.filter((a) => a.is_active).reduce((sum, a) => sum + Number(a.balance), 0);

  async function handleSetDefault(account: ApiFinancePaymentAccount) {
    setBusyId(account.id);
    try {
      await updatePaymentAccount(account.id, { is_default: true });
      await load();
      toast.success(`${account.name} is now the default account`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update account");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleActive(account: ApiFinancePaymentAccount) {
    setBusyId(account.id);
    try {
      await updatePaymentAccount(account.id, { is_active: !account.is_active });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update account");
    } finally {
      setBusyId(null);
    }
  }

  const headerLeftActions = (
    <ListGridHeaderStart title="Payment accounts">
      <FinanceGridSettingsMenu
        apiHealth={apiHealth}
        loading={loading}
        filterCount={filterCount}
        onRefresh={() => {
          void load();
          apiHealth.recheck();
        }}
        onFilters={() => gridRef.current?.openFilters()}
        onColumns={() => gridRef.current?.openColumns()}
        onExport={() => gridRef.current?.exportCsv()}
        onResetFilters={() => gridRef.current?.resetFilters()}
      />
      {canWrite ? (
        <>
          <Button
            size="sm"
            variant="outline"
            className="h-[26px] rounded-none"
            onClick={() => {
              setTransferFromId(null);
              setTransferOpen(true);
            }}
            disabled={accounts.filter((a) => a.is_active).length < 2}
          >
            <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
            Transfer
          </Button>
          <Button size="sm" className="h-[26px] rounded-none" onClick={() => setDrawerOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New account
          </Button>
        </>
      ) : null}
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <PaymentAccountGrid
        ref={gridRef}
        rows={accounts}
        loading={loading && accounts.length === 0}
        canWrite={canWrite}
        busyId={busyId}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${accounts.length} accounts · Cash & bank ${money(totalBalance)}`}
          </span>
        }
        onSetDefault={(account) => void handleSetDefault(account)}
        onToggleActive={(account) => void handleToggleActive(account)}
        onTransfer={(account) => {
          setTransferFromId(account.id);
          setTransferOpen(true);
        }}
      />
      <PaymentAccountDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCreate={async (input) => {
          await createPaymentAccount(input);
          await load();
        }}
      />
      <PaymentAccountTransferDrawer
        open={transferOpen}
        onOpenChange={setTransferOpen}
        accounts={accounts}
        defaultFromId={transferFromId}
        onTransfer={async (input) => {
          await transferPaymentAccounts(input);
          await load();
        }}
      />
    </div>
  );
}
