# AgainERP Vendor Management System

## Product Requirements & Functional Specification

**Document Type:** Module Specification / Product Requirements\
**Module:** Vendor Management\
**Platform:** AgainERP\
**Primary Target Market:** IT Product Sellers, Distributors, Dealers,
Resellers & Wholesalers\
**Status:** Architecture & Development Reference\
**Version:** 1.0

------------------------------------------------------------------------

# 1. Purpose

AgainERP Vendor Management is a B2B vendor commerce and
relationship-management module.

The goal is to allow vendors/dealers/resellers to access a secure Vendor
Portal where they can:

-   View products available from AgainERP
-   View stock availability
-   View their own vendor-specific prices
-   Add products to a cart
-   Create and submit order requests
-   View quotations
-   Negotiate quotations when enabled
-   View invoices and payment status
-   View account ledger and outstanding balance
-   Track order and delivery status
-   Receive notifications
-   Use AI assistance for product discovery and ordering

AgainERP administrators must have complete control over:

-   Vendors
-   Vendor groups
-   Vendor users
-   Vendor branches
-   Vendor-specific pricing
-   Discounts
-   Credit limits
-   Orders
-   Quotations
-   Negotiations
-   Invoices
-   Payments
-   Vendor ledger
-   Permissions
-   Portal visibility
-   Vendor analytics

The module must be designed as a reusable B2B Commerce Layer, not as a
simple vendor CRUD module.

------------------------------------------------------------------------

# 2. Core Business Concept

The core workflow is:

``` text
ERP Admin
    ↓
Vendor Management
    ↓
Vendor Group / Pricing / Credit / Permissions
    ↓
Vendor Portal
    ↓
Product Catalog
    ↓
Stock + Vendor-specific Price
    ↓
Cart
    ↓
Vendor Order Request
    ↓
ERP Admin Review
    ↓
Edit / Adjust
    ↓
Quotation
    ↓
Negotiation (Optional)
    ↓
Final Approval
    ↓
Final Order
    ↓
Invoice
    ↓
Payment
    ↓
Delivery
    ↓
Completed
```

Important:

A vendor-submitted order should initially be treated as an **Order
Request**, not automatically as a final ERP order.

The ERP Admin must be able to review and modify the request before final
confirmation.

------------------------------------------------------------------------

# 3. Design Principles

The module must follow these principles:

1.  Multi-vendor
2.  Multi-user per vendor
3.  Multi-branch per vendor
4.  Vendor-specific pricing
5.  Vendor-group pricing
6.  Role-based permissions
7.  Configurable stock visibility
8.  Configurable credit control
9.  Auditability
10. AI-ready architecture
11. API-first design
12. Mobile-friendly Vendor Portal
13. Drawer/modal-based admin workflows where practical
14. Reusable pricing engine
15. Reusable quotation/order engine
16. No hard-coded business rules
17. Tenant-safe data isolation
18. Full activity/audit logging

------------------------------------------------------------------------

# 4. Vendor Entity

Each vendor should have a complete master profile.

## 4.1 Basic Information

-   Vendor ID
-   Vendor Code
-   Company Name
-   Legal Name
-   Display Name
-   Contact Person
-   Phone
-   Email
-   Website
-   Logo
-   Vendor Type
-   Vendor Group
-   Status

## 4.2 Address

-   Billing Address
-   Default Shipping Address
-   Multiple Shipping Addresses
-   City
-   State/Division
-   Country
-   Postal Code

## 4.3 Business Information

-   Trade License
-   VAT/TAX ID
-   BIN/TIN
-   Business Registration Number
-   Payment Terms
-   Credit Limit
-   Currency
-   Preferred Payment Method

## 4.4 Account Management

-   Assigned Account Manager
-   Sales Representative
-   Customer/Vendor Relationship Status
-   Onboarding Date
-   Last Order Date
-   Last Payment Date
-   Notes

## 4.5 Portal Access

-   Portal Enabled
-   Portal Status
-   Login Email
-   Number of Users
-   Last Login
-   Last Activity
-   2FA Enabled
-   Password Reset
-   Login History

------------------------------------------------------------------------

# 5. Vendor Types

The system should support configurable vendor types.

Example:

-   Dealer
-   Distributor
-   Reseller
-   Retailer
-   Corporate
-   Wholesaler
-   System Integrator
-   Online Seller
-   Regional Partner
-   VIP Partner

Admin should be able to create custom types.

------------------------------------------------------------------------

# 6. Vendor Groups

Vendors can belong to a group.

Examples:

``` text
Gold Dealer
Silver Dealer
Platinum Dealer
Distributor
Corporate
VIP
Reseller
Retail
```

Vendor Group can control:

-   Price List
-   Discount Rules
-   Credit Policy
-   Stock Visibility
-   Product Visibility
-   Payment Terms
-   Order Limits
-   Minimum Order Quantity
-   Approval Requirements
-   Portal Features

A vendor may have one primary group, with future support for additional
segmentation if required.

------------------------------------------------------------------------

# 7. Vendor Users

A vendor company can have multiple portal users.

Example:

``` text
ABC Computers
│
├── Owner
├── Purchase Manager
├── Accounts Manager
├── Sales Manager
└── Staff
```

Each user must have:

-   User ID
-   Vendor ID
-   Name
-   Email
-   Phone
-   Role
-   Status
-   Last Login
-   Permissions

------------------------------------------------------------------------

# 8. Vendor Roles & Permissions

Example roles:

## Owner

Full vendor portal access.

## Purchase Manager

Can:

-   View products
-   View stock
-   View prices
-   Create orders
-   View quotations
-   Accept/reject quotations
-   Track deliveries

## Accounts Manager

Can:

-   View invoices
-   View payments
-   View ledger
-   View outstanding
-   Download financial documents

## Staff

Can have limited product and order access.

Permissions should be granular.

Example:

``` text
vendor.products.view
vendor.stock.view
vendor.price.view
vendor.order.create
vendor.order.view
vendor.order.cancel
vendor.quotation.view
vendor.quotation.accept
vendor.invoice.view
vendor.payment.view
vendor.ledger.view
vendor.users.manage
```

------------------------------------------------------------------------

# 9. Vendor Branches

A vendor may have multiple branches.

Example:

``` text
ABC Computers
├── Dhaka Branch
├── Chattogram Branch
└── Sylhet Branch
```

Each branch can have:

-   Branch Name
-   Branch Code
-   Address
-   Contact
-   Delivery Address
-   Users
-   Order destination

The vendor should be able to select a delivery branch when creating an
order.

------------------------------------------------------------------------

# 10. Vendor Product Catalog

The Vendor Portal must have a product catalog.

Each product can display:

-   Product Name
-   SKU
-   Model
-   Brand
-   Category
-   Image
-   Short Description
-   Specifications
-   Warranty
-   Stock Status
-   Available Stock
-   Vendor Price
-   MRP
-   Discount
-   Final Price
-   Minimum Order Quantity
-   Maximum Order Quantity
-   Orderable Status

------------------------------------------------------------------------

# 11. IT Product Specific Requirements

Because the first target market is IT product sellers, the architecture
should support:

-   Brand
-   Model
-   SKU
-   Barcode
-   Part Number
-   Product Category
-   Product Variant
-   Warranty
-   Serial Number where applicable
-   IMEI where applicable
-   Batch where applicable
-   Supplier
-   Purchase Cost
-   Selling Price
-   Dealer Price
-   Distributor Price
-   Stock Quantity
-   Reserved Quantity
-   Available Quantity

The Vendor Portal should not expose internal procurement cost unless
explicitly permitted.

------------------------------------------------------------------------

# 12. Stock Visibility

Stock visibility must be configurable.

Possible modes:

### Exact

``` text
Stock: 27 Units
```

### Availability

``` text
In Stock
```

### Threshold

``` text
5+ Available
```

### Hidden

``` text
Contact Sales
```

The visibility policy may be configured:

-   Globally
-   Per vendor group
-   Per vendor
-   Per product
-   Per category

------------------------------------------------------------------------

# 13. Vendor Pricing Engine

Pricing is one of the core components.

A vendor must not necessarily see the standard ERP selling price.

Pricing priority should follow a controlled hierarchy.

Recommended priority:

``` text
Vendor-specific price
        ↓
Vendor group price
        ↓
Price list price
        ↓
Product/channel price
        ↓
Default selling price
```

The final price must be calculated by the pricing engine.

Do not duplicate pricing logic across UI/API/order code.

------------------------------------------------------------------------

# 14. Price Lists

Admin can create price lists.

Examples:

``` text
Retail Price
Dealer Price
Gold Dealer Price
Silver Dealer Price
Distributor Price
VIP Price
Corporate Price
```

A price list can contain:

-   Product
-   Base Price
-   Discount
-   Effective From
-   Effective Until
-   Minimum Quantity
-   Maximum Quantity
-   Status

A vendor or vendor group can be assigned a price list.

------------------------------------------------------------------------

# 15. Quantity-Based Pricing

Support quantity breaks.

Example:

``` text
1-9 units       → ৳5,000
10-49 units     → ৳4,900
50-99 units     → ৳4,750
100+ units      → ৳4,600
```

The pricing engine should automatically calculate the applicable price.

------------------------------------------------------------------------

# 16. Discount Rules

Support configurable discount rules.

Examples:

``` text
Gold Group + ASUS → 5%
Distributor + Laptop Category → 8%
50+ Quantity → 3%
Campaign → 10%
```

Rules should support:

-   Percentage discount
-   Fixed amount discount
-   Product-level discount
-   Category-level discount
-   Brand-level discount
-   Quantity-based discount
-   Vendor-group discount
-   Date-based campaign discount

------------------------------------------------------------------------

# 17. Price Protection

Once a vendor order is submitted, the system should record the price
used at submission time.

Example:

``` text
Product Price at Order Time:
৳48,500
```

If the product price later changes, the historical order must not
change.

Price snapshots are mandatory.

------------------------------------------------------------------------

# 18. Vendor Cart

Vendor portal should support a B2B cart.

Cart contains:

-   Product
-   SKU
-   Quantity
-   Unit Price
-   Discount
-   Tax
-   Subtotal
-   Total

Cart should validate:

-   Stock
-   Minimum quantity
-   Maximum quantity
-   Vendor eligibility
-   Price availability
-   Product status
-   Credit availability

------------------------------------------------------------------------

# 19. Quick Order

Provide a Quick Order interface.

Example:

``` text
SKU       Quantity
KB-001    20
MS-002    15
SSD-004   10
```

System should identify SKUs and add valid products to the cart.

Invalid SKUs should be reported clearly.

------------------------------------------------------------------------

# 20. Bulk Order Import

Future-ready support for:

-   CSV
-   Excel

Vendor can upload:

``` text
SKU | Quantity
```

System validates and generates a cart/order draft.

------------------------------------------------------------------------

# 21. Vendor Order Request

When vendor submits a cart:

``` text
Cart
 ↓
Order Request
```

Order Request should contain:

-   Order Request Number
-   Vendor
-   Vendor User
-   Branch
-   Products
-   Quantity
-   Price Snapshot
-   Discount
-   Tax
-   Shipping
-   Total
-   Notes
-   Delivery Address
-   Payment Terms
-   Requested Delivery Date

Initial status:

``` text
SUBMITTED
```

------------------------------------------------------------------------

# 22. Order Request Status

Recommended statuses:

``` text
DRAFT
SUBMITTED
UNDER_REVIEW
REVISION_REQUIRED
QUOTATION_CREATED
NEGOTIATION
APPROVED
REJECTED
CONVERTED_TO_ORDER
CANCELLED
```

------------------------------------------------------------------------

# 23. ERP Admin Order Review

ERP Admin must be able to open an order request and:

-   Edit quantity
-   Change product
-   Add product
-   Remove product
-   Change price
-   Apply discount
-   Add tax
-   Add shipping
-   Change delivery address
-   Change payment terms
-   Add internal note
-   Add vendor-visible note
-   Approve
-   Reject
-   Create quotation
-   Request revision

Every modification must be logged.

------------------------------------------------------------------------

# 24. Internal vs Vendor-visible Notes

Support two note types:

### Internal Note

Only ERP staff can see.

### Vendor Note

Visible to vendor.

Never expose internal notes to the Vendor Portal.

------------------------------------------------------------------------

# 25. Quotation System

Order requests can be converted into quotations.

Quotation contains:

-   Quotation Number
-   Vendor
-   Vendor Contact
-   Products
-   Quantity
-   Unit Price
-   Discount
-   Tax
-   Shipping
-   Grand Total
-   Payment Terms
-   Delivery Terms
-   Valid Until
-   Notes

Status:

``` text
DRAFT
SENT
VIEWED
NEGOTIATION
ACCEPTED
REJECTED
EXPIRED
CANCELLED
```

------------------------------------------------------------------------

# 26. Quotation Revision

Admin can create revised quotations.

Example:

``` text
Quotation V1
    ↓
Vendor requests change
    ↓
Quotation V2
    ↓
Vendor accepts
```

Previous versions must remain available for audit.

Never overwrite historical quotation versions.

------------------------------------------------------------------------

# 27. Negotiation

Negotiation is optional and configurable.

Vendor may request:

-   Lower price
-   Different quantity
-   Different delivery date
-   Different payment terms

ERP Admin can:

-   Accept
-   Reject
-   Counter-offer
-   Create revised quotation

All negotiation activity must be logged.

------------------------------------------------------------------------

# 28. Final Order

Once quotation/order request is approved:

``` text
Quotation
    ↓
Final Order
```

Final order becomes an official ERP transaction.

The system must store:

-   Final prices
-   Final discounts
-   Tax
-   Shipping
-   Delivery
-   Payment terms
-   Approval history

------------------------------------------------------------------------

# 29. Invoice

Final orders can generate invoices.

Vendor should be able to:

-   View invoice
-   Download invoice
-   View payment status
-   View due amount
-   View due date

Invoice status:

``` text
UNPAID
PARTIALLY_PAID
PAID
OVERDUE
CANCELLED
```

------------------------------------------------------------------------

# 30. Credit Management

Each vendor should have:

-   Credit Limit
-   Used Credit
-   Available Credit
-   Outstanding
-   Overdue
-   Credit Utilization %

Example:

``` text
Credit Limit:       ৳500,000
Outstanding:        ৳240,000
Available Credit:   ৳260,000
Utilization:        48%
```

Order submission should validate credit policy.

If credit exceeds the limit:

``` text
Credit Limit Exceeded
Admin Approval Required
```

------------------------------------------------------------------------

# 31. Vendor Ledger

Vendor ledger should record:

-   Orders
-   Invoices
-   Payments
-   Credits
-   Debits
-   Refunds
-   Adjustments

Vendor can view allowed ledger information.

ERP Admin can view full ledger.

------------------------------------------------------------------------

# 32. Payments

Future-ready payment support:

-   Cash
-   Bank Transfer
-   Mobile Banking
-   Card
-   Online Payment
-   Credit Adjustment

Payment records:

-   Payment ID
-   Vendor
-   Invoice
-   Amount
-   Method
-   Date
-   Reference
-   Status

------------------------------------------------------------------------

# 33. Partial Delivery

Support partial fulfillment.

Example:

``` text
Order:
100 × Keyboard

Delivered:
60

Remaining:
40
```

Order status:

``` text
PARTIALLY_DELIVERED
```

Inventory must update according to actual fulfillment.

------------------------------------------------------------------------

# 34. Product Availability Request

If product is out of stock:

Vendor can select:

``` text
Notify Me
```

Optional request:

``` text
Required Quantity: 50
```

ERP can see demand:

``` text
Vendor A → 50
Vendor B → 30
Vendor C → 20
Total Demand → 100
```

This can later connect with procurement planning.

------------------------------------------------------------------------

# 35. Vendor Notifications

Notification events:

-   Order submitted
-   Order approved
-   Order rejected
-   Revision requested
-   Quotation created
-   Quotation revised
-   Quotation accepted
-   Price changed
-   Stock available
-   Invoice created
-   Payment received
-   Credit warning
-   Delivery update

Notification channels should be extensible:

-   In-app
-   Email
-   SMS
-   WhatsApp
-   Push notification

------------------------------------------------------------------------

# 36. Vendor Dashboard

Recommended dashboard cards:

``` text
Available Credit
Outstanding
Pending Orders
Open Quotations
Active Orders
Total Orders
Total Purchase
```

Additional sections:

-   Recent Orders
-   Popular Products
-   Low Stock Products
-   New Products
-   Price Changes
-   Notifications
-   Quick Order

------------------------------------------------------------------------

# 37. Vendor Analytics

ERP Admin analytics:

-   Total Vendors
-   Active Vendors
-   New Vendors
-   Active Orders
-   Vendor Revenue
-   Vendor Purchase Volume
-   Average Order Value
-   Order Frequency
-   Cancellation Rate
-   Payment Performance
-   Outstanding
-   Credit Utilization
-   Top Vendors
-   Dormant Vendors

------------------------------------------------------------------------

# 38. Vendor Performance Score

Optional scoring system:

``` text
Payment Reliability
Order Frequency
Order Volume
Cancellation Rate
Credit Utilization
Relationship Duration
```

Example:

``` text
ABC Computers
Score: 92/100
Tier: Gold
```

This score should be configurable and explainable.

------------------------------------------------------------------------

# 39. Vendor Ranking

Admin can rank vendors by:

-   Revenue
-   Order count
-   Purchase volume
-   Payment performance
-   Profitability
-   Growth
-   Activity

Date filters:

-   Today
-   This Week
-   This Month
-   This Quarter
-   This Year
-   Custom Range

------------------------------------------------------------------------

# 40. Vendor Documents

Support:

-   Trade License
-   VAT/TAX documents
-   Agreements
-   Contracts
-   Bank information
-   Certificates
-   Other documents

Documents must support:

-   Upload
-   Preview
-   Download
-   Expiry date
-   Verification status

------------------------------------------------------------------------

# 41. Vendor Onboarding

Recommended onboarding workflow:

``` text
Lead / Invitation
      ↓
Vendor Registration
      ↓
Business Verification
      ↓
Admin Approval
      ↓
Vendor Group Assignment
      ↓
Price List Assignment
      ↓
Credit Policy
      ↓
Portal Activation
```

Vendor status:

``` text
INVITED
PENDING
UNDER_REVIEW
APPROVED
ACTIVE
SUSPENDED
BLOCKED
ARCHIVED
```

------------------------------------------------------------------------

# 42. Vendor Portal Security

Required:

-   Secure authentication
-   Password reset
-   Session management
-   Role-based access
-   Vendor-level data isolation
-   Optional 2FA
-   Login history
-   Device/session management
-   Audit logging

A vendor must never access another vendor's:

-   Prices
-   Orders
-   Invoices
-   Customers
-   Ledger
-   Stock policies
-   Internal notes

------------------------------------------------------------------------

# 43. Audit Log

Audit every important action.

Examples:

``` text
Vendor created
Vendor group changed
Price changed
Discount changed
Order submitted
Order edited
Quotation created
Quotation revised
Quotation accepted
Invoice created
Payment recorded
Credit limit changed
Permission changed
Portal user created
```

Log:

-   User
-   Action
-   Entity
-   Entity ID
-   Old value
-   New value
-   Timestamp
-   IP/device where appropriate

------------------------------------------------------------------------

# 44. AI Vendor Assistant

AgainERP is AI-first, so the Vendor Portal should be AI-ready.

Vendor AI can answer:

``` text
What is the stock of RTX 5060?

Show me my price for Logitech products.

Create an order for 20 keyboards.

What did I order last month?

Which products are low in stock?

How much credit do I have?

Show my unpaid invoices.

What is my latest quotation?
```

AI should not directly finalize financial transactions without explicit
authorization.

Recommended workflow:

``` text
AI Command
    ↓
Intent Detection
    ↓
Draft Action
    ↓
Validation
    ↓
User Confirmation
    ↓
Transaction Execution
    ↓
Audit Log
```

------------------------------------------------------------------------

# 45. ERP Admin AI

Admin AI examples:

``` text
Show vendors with outstanding above ৳500,000.

Which vendors have not ordered in 60 days?

Create a quotation for ABC Computers.

Show the top 20 vendors this month.

Which vendors are close to their credit limit?

Which products are most ordered by distributors?

Find vendors whose order volume dropped this month.
```

AI must use permission-aware tools and never bypass authorization.

------------------------------------------------------------------------

# 46. API Architecture

The module should be API-first.

Suggested domains:

``` text
/api/vendors
/api/vendor-groups
/api/vendor-users
/api/vendor-branches
/api/vendor-price-lists
/api/vendor-pricing
/api/vendor-orders
/api/vendor-quotations
/api/vendor-invoices
/api/vendor-payments
/api/vendor-ledger
/api/vendor-notifications
/api/vendor-analytics
```

Vendor Portal APIs must enforce vendor identity and tenant isolation.

------------------------------------------------------------------------

# 47. Suggested Core Data Model

Recommended entities:

``` text
vendors
vendor_groups
vendor_users
vendor_roles
vendor_permissions
vendor_branches

vendor_price_lists
vendor_price_list_items
vendor_price_rules
vendor_discount_rules

vendor_carts
vendor_cart_items

vendor_order_requests
vendor_order_request_items

vendor_quotations
vendor_quotation_versions
vendor_quotation_items
vendor_negotiations

vendor_orders
vendor_order_items

vendor_invoices
vendor_payments
vendor_ledger_entries

vendor_documents
vendor_notifications
vendor_availability_requests

vendor_audit_logs
vendor_settings
```

Use relationships to existing AgainERP entities for:

``` text
products
brands
categories
inventory
stock
orders
customers
payments
users
warehouses
branches
```

Do not unnecessarily duplicate existing core ERP entities.

------------------------------------------------------------------------

# 48. Inventory Integration

Vendor Portal must consume stock from the core Inventory module.

Do not create a separate vendor stock table unless there is a genuine
business requirement.

Recommended:

``` text
Core Inventory
      ↓
Inventory Availability Service
      ↓
Vendor Visibility Policy
      ↓
Vendor Portal
```

This keeps inventory as the Single Source of Truth.

------------------------------------------------------------------------

# 49. Product Integration

Vendor Portal should use the existing Product Catalog.

Do not duplicate product master data.

Vendor-specific information should live in mapping/configuration
entities such as:

``` text
vendor_product_settings
vendor_product_prices
vendor_product_visibility
vendor_product_rules
```

------------------------------------------------------------------------

# 50. Permission Architecture

Use both:

### ERP permissions

Controls what internal employees can do.

### Vendor permissions

Controls what external vendor users can do.

Never mix the two permission scopes.

------------------------------------------------------------------------

# 51. Admin Navigation

Suggested AgainERP Admin navigation:

``` text
Vendor Management
│
├── Dashboard
├── Vendors
├── Vendor Groups
├── Vendor Users
├── Vendor Branches
├── Price Lists
├── Pricing Rules
├── Discount Rules
├── Order Requests
├── Quotations
├── Negotiations
├── Orders
├── Invoices
├── Payments
├── Ledger
├── Availability Requests
├── Documents
├── Notifications
├── Analytics
└── Settings
```

------------------------------------------------------------------------

# 52. Vendor Portal Navigation

``` text
Dashboard
Products
Quick Order
Cart
Orders
Quotations
Invoices
Payments
Ledger
Availability Requests
Notifications
Documents
Users & Permissions
Company Profile
Settings
AI Assistant
```

------------------------------------------------------------------------

# 53. UI/UX Requirements

AgainERP UI principles should be followed.

Admin UI:

-   Modern ERP interface
-   Fast tables
-   Search
-   Filters
-   Saved views
-   Bulk actions
-   Drawers for create/edit where practical
-   Side panels
-   Status badges
-   Timeline
-   Activity log
-   Responsive layout

Vendor Portal:

-   Clean B2B commerce interface
-   Mobile friendly
-   Fast product search
-   Quick reorder
-   Clear pricing
-   Clear stock status
-   Easy order creation
-   Minimal complexity

------------------------------------------------------------------------

# 54. Order Timeline

Every order should have a timeline.

Example:

``` text
Aug 18 10:15
Vendor submitted order

Aug 18 10:40
Admin reviewed order

Aug 18 11:00
Quotation created

Aug 18 11:20
Vendor viewed quotation

Aug 18 11:35
Vendor accepted

Aug 18 11:40
Final order created

Aug 18 15:00
Invoice generated
```

------------------------------------------------------------------------

# 55. Business Rules

Important rules:

1.  Vendor can only see its own data.
2.  Vendor price must be calculated by the central pricing engine.
3.  Historical orders must preserve price snapshots.
4.  Stock must come from the central inventory source.
5.  Vendor-submitted requests must not automatically become final orders
    unless configured.
6.  Admin can edit vendor order requests.
7.  All financial changes must be auditable.
8.  Internal notes must never be visible to vendors.
9.  Credit rules must be enforced server-side.
10. Permissions must be enforced server-side.
11. AI must not bypass permissions.
12. Deleted financial records should be soft-deleted/archived rather
    than physically removed where required for audit.

------------------------------------------------------------------------

# 56. MVP Scope

The first implementation should NOT attempt to build every advanced
feature.

## Phase 1 --- Core MVP

Implement:

-   Vendor Master
-   Vendor Groups
-   Vendor Users
-   Vendor Portal Login
-   Product Catalog
-   Stock Visibility
-   Vendor-specific Pricing
-   Price Lists
-   Cart
-   Vendor Order Request
-   Admin Order Review
-   Admin Order Editing
-   Quotation
-   Final Order
-   Basic Invoice
-   Basic Credit Limit
-   Basic Notifications
-   Audit Log

This is the minimum usable B2B Vendor Commerce system.

------------------------------------------------------------------------

# 57. Phase 2 --- Professional Vendor System

Add:

-   Vendor Branches
-   Negotiation
-   Quotation Revision
-   Vendor Ledger
-   Payment Management
-   Partial Delivery
-   Availability Requests
-   Bulk Order
-   Quick Order
-   Advanced Pricing Rules
-   Discount Engine
-   Vendor Analytics
-   Vendor Documents
-   Advanced Permissions

------------------------------------------------------------------------

# 58. Phase 3 --- AI Vendor Commerce

Add:

-   Vendor AI Assistant
-   AI product recommendation
-   AI order drafting
-   AI reorder suggestions
-   AI sales insights
-   AI vendor risk detection
-   AI credit monitoring
-   AI quotation assistance
-   Natural-language ERP commands

------------------------------------------------------------------------

# 59. Phase 4 --- B2B Marketplace Layer

Future possibility:

``` text
AgainERP
   ↓
Vendor Commerce Platform
   ↓
Dealer Portal
   ↓
Distributor Portal
   ↓
Reseller Portal
   ↓
Wholesale Marketplace
```

This architecture should allow the Vendor Management module to evolve
into a complete B2B ordering ecosystem.

------------------------------------------------------------------------

# 60. Recommended Development Order

Development should follow this order:

``` text
STEP 01
Vendor Data Model

STEP 02
Vendor Groups

STEP 03
Vendor Users & Permissions

STEP 04
Vendor Portal Authentication

STEP 05
Product Catalog Integration

STEP 06
Inventory / Stock Visibility

STEP 07
Pricing Engine Integration

STEP 08
Vendor Cart

STEP 09
Vendor Order Request

STEP 10
ERP Admin Order Review

STEP 11
Quotation System

STEP 12
Final Order Conversion

STEP 13
Invoice Integration

STEP 14
Credit Management

STEP 15
Notifications

STEP 16
Audit Logs

STEP 17
Vendor Analytics

STEP 18
Advanced Pricing & Negotiation

STEP 19
AI Vendor Assistant
```

------------------------------------------------------------------------

# 61. Critical Architecture Rule

Before implementing UI, inspect the existing AgainERP architecture.

Do not create duplicate:

-   Product tables
-   Inventory tables
-   User tables
-   Order tables
-   Invoice tables
-   Payment tables

Reuse existing AgainERP domain entities wherever possible.

The Vendor Management module should act as a domain layer around
existing ERP capabilities.

------------------------------------------------------------------------

# 62. Expected Final Experience

## Vendor

Vendor logs in:

``` text
Dashboard
   ↓
Search Product
   ↓
View Vendor Price
   ↓
View Stock
   ↓
Add to Cart
   ↓
Submit Order
```

## ERP Admin

Admin receives:

``` text
New Vendor Order Request
   ↓
Review
   ↓
Edit if required
   ↓
Create Quotation
   ↓
Vendor Approval
   ↓
Final Order
   ↓
Invoice
   ↓
Delivery
```

## AI

Vendor:

``` text
"Create an order for 20 Logitech keyboards."
```

AI:

``` text
20 × Logitech Keyboard
Vendor Price: ৳X
Stock: Y
Total: ৳Z

Create order draft?
[Confirm]
```

After confirmation:

``` text
Draft
→ Validation
→ Order Request
→ ERP Workflow
→ Audit Log
```

------------------------------------------------------------------------

# 63. Success Criteria

The module will be considered successful when:

-   A vendor can securely log in.
-   Vendor sees only its permitted products.
-   Vendor sees the correct vendor-specific price.
-   Vendor sees stock according to configured visibility rules.
-   Vendor can create an order request.
-   ERP Admin receives the request.
-   Admin can edit the request.
-   Admin can create a quotation.
-   Vendor can view and respond to quotation.
-   Final order can be created.
-   Invoice can be generated.
-   Credit rules work correctly.
-   All important actions are audited.
-   Existing Product, Inventory, Order and Finance modules remain the
    source of truth.
-   The architecture is ready for AI and future B2B marketplace
    capabilities.

------------------------------------------------------------------------

# 64. Implementation Instruction for Claude / Cursor

Treat this document as the functional source of truth for the AgainERP
Vendor Management module.

Before coding:

1.  Inspect the existing AgainERP repository.
2.  Identify existing Product, Inventory, User, Order, Invoice, Payment,
    Branch and Permission models.
3.  Map the existing architecture to this specification.
4.  Identify what can be reused.
5.  Identify missing domain entities.
6.  Do not duplicate existing core ERP entities.
7.  Produce an implementation plan before modifying code.
8.  Implement backend/domain logic before complex UI.
9.  Keep pricing and stock calculations server-side.
10. Enforce tenant/vendor isolation at API/database level.
11. Add audit logging for sensitive actions.
12. Keep the module API-first.
13. Build responsive Vendor Portal UI.
14. Use existing AgainERP UI/design system.
15. Keep the system extensible for AI integration.

When a requirement is ambiguous, prefer a configurable architecture
instead of hard-coding one business rule.

The final implementation should feel like a professional B2B
Dealer/Distributor Portal integrated directly into AgainERP.
