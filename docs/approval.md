# Approvals (maker–checker)

Some actions commit stock, money or a customer/supplier balance. For those, **a user who has not been given the Approve
permission cannot finalize the action alone**: it waits in **Inventory › Approve** until an approver accepts it. A user who
*has* the Approve permission finalizes it directly, with no extra step.

- Menu: **Inventory › Approve** (left of *Reports*). It shows a count of what is waiting.
- Permission: **Approve**, a new column in **Workspace › Roles** (per module: Purchase, Sales, RMA, Finance, …). The System
  Manager always has it; every other role starts without it.
- Code: `app/services/core/approval_gate.py` (rules), `approval_actions.py` (the list below), `middleware/approval_gate.py`
  (the gate), `routers/approvals.py` (the Approve screen API), web: `app/(admin)/inventory/approve/`.

## How it works

1. A user without Approve presses the finalizing button (Confirm, Post, Credit, Apply, Ship, Receive, Save a payment …).
2. The API does **not** run it. The call is stored exactly as sent (an `approval_requests` row) and the client gets
   `HTTP 202 { approval_pending: true }`. The screen shows *"Sent for approval — … will be finalized once an approver
   accepts it"*. The document stays a draft; nothing is posted.
3. An approver opens **Inventory › Approve** (see "The Approve screen" below), checks the document, and presses **Approve**
   or **Reject** in the row (Reject asks for an optional reason).
4. **Approve replays the stored call as the approver.** Every rule of the real endpoint still runs at that moment (stock,
   ledger, approval limits, privileged RMA rights). If it fails (for example stock changed), the request stays *Pending* with
   the reason, and the approver sees the same message. Nothing is half-done.
5. The sender can **cancel** a still-pending request. Everyone sees their own requests under *Approve*; approvers also see
   everything they may decide.

Who is an approver for an action: the System Manager, or a role with **Approve** on that action's module. For the four RMA
actions, anyone who already holds the matching privileged RMA right (`rma_approve`, `rma_delivery_approve`,
`rma_claim_approve`, `rma_receive_approve`) is also an approver, so nobody loses a right they had.

## The Approve screen

It is the common datatable ([datatablecommon.md](./common/datatablecommon.md), `approval-grid.tsx` on `FinanceAgListGrid`):
page name + ⚙ settings menu (Refresh · Filters · Columns · Export · Reset filters), filters (search, status, group, type,
requested by, show), counts that double as filters (Waiting for you · Purchase · Sales · RMA · Accounts & Finance), the pinned
actions column, and the standard footer. It opens on **Pending**.

- **Approve and Reject are the first buttons of every row** (column *Action*). Approve first shows one confirmation that names
  the request (type, reference, party, amount), because the list can move when a new request arrives; Reject asks for a reason.
  A request you may not decide shows nothing there; your own pending requests show **Cancel request**.
- **A click on a row (or its Reference) opens the document in its ORIGINAL drawer**, the same one its own page opens, so the
  approver cross-checks the real thing: the sales order drawer for a sales order / invoice / delivery challan / sales return
  made from an order, the quotation in the sales drawer, the receipt drawer, the purchase return drawer, the sales return
  drawer, the stock adjustment drawer, the stock transfer drawer, the RMA drawer for the four RMA decisions, and the customer
  (Ledger tab) or supplier drawer for a Collection / Payment / Party Adjustment. There is no separate approval drawer.
- Requests that have no drawer of their own (a standalone invoice, a voucher between accounts, an expense payment, a payment
  against an invoice, a confirm of several orders) open a small **review dialog** with the request's values read now (a confirm
  of several orders lists them; each opens its own drawer).
- **Finalizing the document from its own drawer also settles its request.** An approver who presses Confirm / Post / Apply in
  the opened drawer is not held (they hold Approve), and the API closes the waiting request as approved ("Finalized directly
  from the document"). This applies to calls that move one document forward; payments and vouchers carry their own values and
  are only closed by Approve / Reject.
- The list reads the latest 200 requests and refreshes every 30 seconds.

## What needs approval

The groups and names are the ones on the Approve screen. **Module** is the module whose *Approve* permission decides.

### Purchase (module `purchase`)
| Document | Finalizing call | What it does |
|---|---|---|
| Goods Receive | `POST /purchase/receipts/{id}/post` | posts the receipt: stock in, payable raised |
| Purchase Return | `POST /purchase/returns/{id}/credit` | goods out, supplier credit posted |
| Stock Adjustment | `POST /inventory/stock-adjustments/{id}/apply` | sets on-hand to the counted quantity |

### Sales (module `sales`)
| Document | Finalizing call | What it does |
|---|---|---|
| Quotation | `PATCH /sales/quotations/{id}/status` with `status: approved` | approves the quotation (sending it or rejecting it needs no approval) |
| Sales Order | `POST /sales/orders/{id}/confirm`, `POST /sales/orders/bulk-status` with `status: confirmed` | reserves stock, delivers, issues the invoice, posts the receivable |
| Delivery Challan | `POST /sales/deliveries/{id}/post` | stock leaves the warehouse |
| Invoice | `POST /sales/orders/{id}/invoice`, `POST /sales/orders/{id}/link-invoice`, `POST /sales/invoices` | issues the invoice / posts the receivable |
| Sales Return | `POST /sales/returns/{id}/credit`, `POST /sales/returns` with `auto_credit` | stock back in, credit note posted |
| Party Adjustment | `POST /commerce/customers/{id}/ledger/invoices` | a manual debit on the customer's balance |
| Product Transfer | `POST /inventory/stock-transfers/{id}/ship`, `…/receive` | stock leaves the source / lands at the destination |

### RMA (module `rma`)
| Document | Finalizing call (only when `decision` is `approved`) | What it does |
|---|---|---|
| Complain Receive | `POST /rma/tickets/{id}/decision` | accepts the complaint; the received unit goes into the RMA store |
| Customer Delivery | `POST /rma/deliveries/{id}/decision` | the unit leaves the RMA store, charges are billed |
| Replacement Claim | `POST /rma/claims/{id}/decision` | approves the supplier claim |
| Replacement Receive | `POST /rma/receipts/{id}/decision` | the replacement comes back from the supplier into the RMA store |

Rejecting or asking for a correction (`rejected`, `correction_requested`) never needs approval.

### Accounts & Finance (module `finance`)
| Document | Finalizing call | What it does |
|---|---|---|
| Collection | `POST /commerce/customers/{id}/ledger/payments`, `POST /finance/receivables/{id}/settle`, `POST /sales/invoices/{id}/payments` | money received from a customer |
| Payment | `POST /commerce/suppliers/{id}/payments`, `POST /finance/payables/{id}/settle`, `POST /finance/expenses/{id}/pay` | money paid to a supplier / for an expense (also a refund received from a supplier) |
| Voucher | `POST /finance/payment-accounts/transfer` | moves money between two payment accounts |

## Order edit requests (a locked sales order)

A confirmed sales order is locked. Staff without admin rights see *"This order is locked after confirmation"* in its drawer
and press **Request edit** (with a reason, for example "Price change hobe 5000 to 4500"). That request is saved against the
order (`sales_order_edit_requests`, the order's own flow, unchanged) and **now also appears on Inventory › Approve** as an
**Order Edit** row (group Sales): reference = the order, party = the customer, amount = the order total, details = the
reason. It needs the same decision as everything else there:

- **Approve** (button in the row, after a confirmation): the order unlocks for **one** edit by the person who asked. After their
  next save it locks again. **Reject** keeps it locked and records the reason.
- A click on the row, or its Reference, opens the **sales order drawer** itself to see what is being asked about.
- Who decides: the System Manager or a role with **Approve** on Sales (the same rule as every Sales approval). The sender sees
  their own request and its decision, and cannot decide it. An approved request that has been used reads "Approved and used".
- It is counted in the Approve badge and in the Sales count.

Reviewing it inside the order drawer (the banner with Approve / Reject for the System Manager) still works and shows up the same
way on the Approve list.

## Not covered (read this)

- **Adjustment Claim** and **Adjustment Claim Finalize**: this ERP has no such feature (no model, no endpoint), so there is
  nothing to hold. When the feature exists, add one entry to `approval_actions.py`.
- **Party Adjustment** is mapped to the only manual party-balance change that exists (a manual customer debit).
  **Voucher** is mapped to the only manual posting that exists (an account-to-account transfer). There is no free-form
  journal voucher; the Journal screen is read-only.
- **Payments typed on an order's Payment tab** are posted to Finance when the order is saved after it has been confirmed
  (a draft order has no receivable yet, so nothing posts until the confirm, which is held). Saving an already-confirmed order
  is not held by this gate; for staff without admin rights it already needs the existing admin-approved *edit request*.
- **POS** sales (`/pos/carts/{id}/complete`) are not held: the POS is its own cash-register flow.
- **Quotation**: approving does not also convert it to an order. Convert after it is approved.
- The approver is the one who runs the call, so records created by it (a posted receipt, a payment) carry the approver as
  the actor; the sender stays on the approval request.
- A request is replayed *as sent*. If the document was edited after the request, the approver approves what is stored in the
  document at that moment (the call carries ids, not a copy of the document).

## Granting the permission

**Workspace › Roles →** pick a role → tick **Approve** on the modules that role may finalize and approve (Purchase, Sales,
RMA, Finance). Users with that role stop waiting and finalize directly, and they can decide other people's requests. The
System Manager role is fixed and always has it.

## Adding an action

One `ApprovalAction(...)` in `app/services/core/approval_actions.py`: the group, the label, the HTTP method, a regex of the
path after `/api/v1/` (named groups become path params), an optional `when=` on the body, and a describer so the Approve list
can show the reference, party and amount. Then run

```
docker exec -w /app againerp-moharaz-api python scripts/verify_approval_registry.py
```

which checks every action against the real routes and the model fields the describers read. No endpoint code changes.

## Tested

`scripts/verify_approval_registry.py` (routes and fields) plus an end-to-end run against the live API: every one of the 26
calls above is held for a user without Approve and appears under the right group (Purchase 3, Sales 12, RMA 4, Finance 7);
non-finalizing calls (quotation `sent`, RMA `rejected`, a sales return without `auto_credit`, bulk `cancelled`) pass straight
through; an approver is never held; and approving really runs the stored call for a quotation (PATCH + body), a stock
adjustment, a stock transfer (ship and receive), a goods receipt and a bulk order confirm. In the browser: pressing Save on a
draft sales order as a user without Approve shows one "Sent for approval" notice, the request appears under Approve with
Approve / Reject as the first buttons of its row, the confirmation names the request, Approve confirms the order, Reject
records the reason, a click on the row opens the original drawer (sales order, quotation, receipt, …), and the Reference link
opens the sales order drawer.
