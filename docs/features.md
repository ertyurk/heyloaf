# Heyloaf - Feature Specification

> Complete feature specification for Heyloaf — a multi-platform POS and business management system for food production, retail, and wholesale businesses.

---

## Table of Contents

1. [Authentication & Users](#1-authentication--users)
2. [Company Management](#2-company-management)
3. [Product Catalog](#3-product-catalog)
4. [Product Categories](#4-product-categories)
5. [Stock Management](#5-stock-management)
6. [Recipes & BOM](#6-recipes--bom)
7. [Production / Cooking Workflow](#7-production--cooking-workflow)
8. [Point of Sale (POS)](#8-point-of-sale)
9. [Orders & Sales](#9-orders--sales)
10. [Purchase & Invoices](#10-purchase--invoices)
11. [Contacts & Ledger (Cari Hesap)](#11-contacts--ledger)
12. [Transactions](#12-transactions)
13. [Price Lists](#13-price-lists)
14. [Marketplace Channels](#14-marketplace-channels)
15. [Scale Integration](#15-scale-integration)
16. [Reports & Analytics](#16-reports--analytics)
17. [Settings](#17-settings)
18. [Dashboard](#18-dashboard)
19. [Super Admin Panel](#19-super-admin-panel)
20. [Internationalization (i18n)](#20-internationalization)
21. [Notifications](#21-notifications)
22. [Audit Trail](#22-audit-trail)

**Legend:** `[DEFERRED]` = planned but not in initial build.

---

## 1. Authentication & Users

### 1.1 Login

- Email + password authentication
- JWT access token + httpOnly refresh cookie
- Session persistence across browser refreshes
- Auto token refresh on expiry

### 1.2 User Management (Admin only)

- Create user: name, email, password, role, per-module permissions
- Edit user: update name, role, permissions
- Delete user
- User list with role and email
- `user.metadata.preferred_language` — overrides company default language

### 1.3 Multi-Company User Model

- One user can belong to multiple companies (many-to-many via `user_companies` junction table)
- Single login, company switcher in UI
- Each user-company relationship has its own role and permissions

### 1.4 Roles

| Role    | Purpose                                      |
| ------- | -------------------------------------------- |
| Admin   | Full access. Bypasses all permission checks. |
| Manager | Configurable per-module access.              |
| User    | Standard access, configurable per module.    |
| Cashier | Intended for POS-only access.                |

### 1.5 Module-Level Permissions

Every user (except admin) has a permission level per module:

| Level  | View | Edit | Manage |
| ------ | ---- | ---- | ------ |
| Admin  | Yes  | Yes  | Yes    |
| Editor | Yes  | Yes  | No     |
| Viewer | Yes  | No   | No     |
| None   | No   | No   | No     |

**Modules:** Products, Stock, Production, POS, Sales, Purchase, Finance, Reports, Settings

### 1.6 Route Protection

- Unauthenticated users redirected to login
- Each screen checks module permission before rendering
- Insufficient permissions -> error + redirect to home

---

## 2. Company Management

### 2.1 Company Profile (Admin only)

- View and edit: name, tax number, address, phone, email, website
- Company logo upload with preview
- No company creation/deletion through UI (CLI tool initially)
- Company-level settings (default currency, timezone, default tax rate, default language)

### 2.2 Multi-Currency

- Company has a base currency (e.g., TRY)
- Support for additional currencies (e.g., EUR, USD)
- Manual exchange rate entry by admin
- Invoices and price lists can use any configured currency

### 2.3 Multi-Tax Setup

- Company-level default tax rate (applied to new products automatically)
- Products can override with their own tax rate
- Multiple tax rates supported (e.g., 1%, 10%, 20%)

### 2.4 Multi-Company

- One user = multiple companies with company switcher
- Data isolation per company enforced at database level (RLS)
- Company provisioning via CLI tool (initial approach)
- `[DEFERRED]` Self-service company onboarding flow

---

## 3. Product Catalog

### 3.1 Product Fields

| Field Group      | Fields                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Identity         | Name, code (unique per company among active products), barcode (optional)                            |
| Classification   | Category, product type, unit of measure                                                              |
| Product type     | RAW, SEMI, FINISHED, COMMERCIAL, CONSUMABLE (immutable after creation)                               |
| Status           | `draft -> inactive -> active` (only active products visible in POS, invoices, reports)               |
| Stock status     | `in-stock`, `out-of-stock`, `no-stock-required`                                                      |
| Sale settings    | Sale unit type (Adet/KG/Litre), PLU type (Weight/Piece), PLU code, scale-enabled                     |
| Tax              | VAT rate (%) -- defaults from company setting, overridable per product                               |
| Stock            | Stock tracking on/off, minimum stock level                                                           |
| Cost             | Last purchase price (auto from invoices), calculated cost (auto from recipe)                         |
| Image            | Product photo (stored in R2)                                                                         |
| Recipe           | Bill of materials, batch size, recipe variants (SEMI and FINISHED only)                              |
| Pricing          | Per-price-list prices                                                                                |
| Purchase options | Unlimited purchase variants: variant name, purchase unit, conversion qty, barcode, supplier, default |

### 3.2 Product Types & Behavior

| Type       | Example             | POS visible | Can have recipe | Can be ingredient | Cost source    |
| ---------- | ------------------- | ----------- | --------------- | ----------------- | -------------- |
| RAW        | Flour, sugar        | No          | No              | Yes               | Purchase price |
| SEMI       | Dough, cream        | No          | Yes             | Yes               | Recipe         |
| FINISHED   | Cake, croissant     | Yes         | Yes             | No                | Recipe         |
| COMMERCIAL | Bottled water       | Yes         | No              | Yes               | Purchase price |
| CONSUMABLE | Cleaning supplies   | No          | No              | No                | Purchase price |

- **Product type is immutable after creation.** User must create a new product if a different type is needed.

### 3.3 Product Status

| Status   | Behavior                                                                |
| -------- | ----------------------------------------------------------------------- |
| Draft    | Only visible in product management. Hidden from POS, invoices, reports. |
| Inactive | Same as draft. Previously active product that has been deactivated.     |
| Active   | Fully visible everywhere: POS, invoices, reports, recipes.              |

### 3.4 Business Rules

- Products have no single price -- all pricing through price lists
- Products have no stored stock quantity -- stock tracked separately
- Code is unique per company among active products
- PLU type = PIECE forces scale-enabled = false
- Barcode is optional
- Purchase variants: unlimited per product, one marked as default

### 3.5 Product List

- Search by name, code, barcode
- Filter by product type, category, status (draft/inactive/active)
- Sortable columns
- Pagination
- Segmented tabs for quick type filtering

### 3.6 Bulk Operations

- Bulk activate / deactivate
- Bulk category assignment
- Bulk add/remove from price lists
- Bulk price update

### 3.7 Product Deletion

- Soft delete: set status to inactive
- Hard delete: permanent, blocked if production records or orders reference it

### 3.8 Product QR Code

- Generate and display QR code per product
- Print/download

### 3.9 Quick Preview

- Product summary popup without opening full edit form

---

## 4. Product Categories

- Hierarchical (parent-child, **max 5 levels** depth)
- Fields: name (unique per company among active), description, parent
- POS visibility flag (show/hide in POS sidebar)
- Display order (custom sort for POS)
- Delete blocked if child categories exist

---

## 5. Stock Management

### 5.1 Stock per Product

- Current quantity, min/max stock levels, reserved quantity, location, last movement date
- Low stock alerts: products at or below minimum level
- Quantity precision configurable per unit (e.g., KG = 3 decimals, Adet = 0 decimals)

### 5.2 Stock Movements

- Immutable record per stock change
- Movement type: In, Out, Transfer, Adjustment
- Source: Purchase, Sale, Production, Return, Adjustment, Transfer, Manual, StockCount
- Quantity (signed), unit price, total price, VAT rate
- Reference to source document (invoice ID, production record ID, order ID)
- Description, created by

### 5.3 Manual Adjustments

- Manual stock movements with positive or negative quantities
- Reason/description required

### 5.4 Stock Counting (Physical Inventory)

- Dedicated stock count flow
- Enter actual quantities per product
- System calculates difference vs current stock
- Auto-generates adjustment movements for discrepancies
- Count recorded with who/when for audit

### 5.5 Stock History

- Per-product chronological movement list

### 5.6 Automatic Stock Updates

| Event                    | Effect                                                        |
| ------------------------ | ------------------------------------------------------------- |
| Purchase invoice created | Stock IN per line item                                        |
| Purchase invoice updated | Old reversed, new created                                     |
| Purchase invoice deleted | Reversed                                                      |
| Production record created| IN for finished, OUT for each material (smart cascade)        |
| Production record updated| Old reversed, new created                                     |
| Production record deleted| Finished reversed, materials returned                         |
| POS sale completed       | Stock OUT per order line item                                 |
| POS sale voided/returned | Stock IN (return)                                             |

### 5.7 Smart Cascade for SEMI Products

When producing a FINISHED product that uses a SEMI product as ingredient:
- **If SEMI has sufficient stock** -> deduct from SEMI's inventory
- **If SEMI has no/insufficient stock** -> cascade to SEMI's raw materials (flour, sugar, etc.)
- System checks stock first, then decides the deduction path automatically

---

## 6. Recipes & BOM

### 6.1 Who Can Have Recipes

Only SEMI and FINISHED products

### 6.2 Material Pool

- All RAW, SEMI, COMMERCIAL products available as ingredients
- Shows: name, type, unit cost, unit, category

### 6.3 Master Recipe (Base BOM)

- Base list of materials for a product
- Each line: material, quantity, unit
- Quantity precision: configurable per unit (e.g., 0.250 kg flour)
- Batch size: units yielded (default: 1)

### 6.4 Recipe Variants

- Named variations (e.g., "Chocolate", "Plain", "Gluten-Free")
- Each variant can add, remove, or override material quantities
- Effective materials = master + variant overrides
- Each variant can have a production note
- Variants can have price modifiers (+/- from base price)
- Variants appear in POS for customer selection

### 6.5 Cost Analysis

| Metric                  | Calculation                                 |
| ----------------------- | ------------------------------------------- |
| Master unit cost        | Total material cost / batch size            |
| Variant cost            | Cost with variant-specific material changes |
| Suggested selling price | Based on desired profit margin              |
| Profit margin           | (Selling price - Cost) / Selling price      |
| Average unit cost       | Weighted average across all variants        |

### 6.6 Drag & Drop

- Materials dragged from pool into recipe editor

---

## 7. Production / Cooking Workflow

### 7.1 Dedicated Production Screen (Mobile-First)

- **Mobile-first design** -- primary use case is kitchen staff on phone/tablet
- Big buttons, minimal text, dead simple for any regular user
- Cook sees the recipe with ingredient checklist (checkmark items as used)
- Optimized for React Native mobile app
- Also available on web/desktop

### 7.2 Create Production Record

- Select product (SEMI or FINISHED with defined recipe)
- Select variant if applicable
- Enter quantity produced
- System shows: materials to be deducted with quantities (scaled by batch size)
- Stock warning: if insufficient materials, show projected negative (e.g., "flour: need 1.5kg, have 0.8kg -> will be -0.7kg")
- **Warn but allow** -- stock can go negative, admin handles discrepancies during stock counts
- On save: stock IN for finished product, stock OUT for each material

### 7.3 Batch Production Sessions

- Cook can add multiple products to a "production session" (cart-like UX)
- Add products -> enter quantities -> see running total of all materials needed
- Material summary across all products in session
- "Complete Session" -> all stock movements executed at once
- Both single-product quick entry and batch session mode available

### 7.4 Edit Production Record

- Update quantity or notes
- On quantity change: all stock movements reversed and recreated

### 7.5 Delete Production Record

- Finished product stock reversed, materials returned
- Deletion recorded in audit history

### 7.6 Production List

- All records: product name, variant, quantity, unit, date, notes
- Today's summary: total records, total quantity

---

## 8. Point of Sale

### 8.1 POS Screen

- Full-screen mode (no navigation, no scroll)
- Product grid: FINISHED and COMMERCIAL products only (active status only)
- Product cards: name, price, image
- Price from terminal's assigned price list

### 8.2 Category Sidebar

- Left sidebar with POS-visible categories
- Click to filter product grid
- Custom display order

### 8.3 Cart

- Add products by click/tap
- Adjust quantity per item
- Remove items
- Running totals: subtotal, tax, total
- Cart persisted (survives page refresh)
- Variant selection for products with recipe variants (with price modifier applied)
- Multiple open carts -- park current cart (saved with label), start new, retrieve parked carts

### 8.4 Barcode Scanning

- Scan barcode to add product to cart
- Camera-based scanning for mobile/tablet
- Hardware scanner support for desktop (auto-focus)

### 8.5 Scale Integration in POS

- Read weight from connected scale for weighted products
- Auto-fill quantity based on scale reading
- PLU code lookup

### 8.6 Keyboard Shortcuts (Desktop)

- Full keyboard support for power cashiers
- F-keys for payment methods (F1=cash, F2=card, etc.)
- Numpad for quantity entry
- Barcode scanner auto-focus
- Enter to confirm, Escape to cancel

### 8.7 Payment

- Payment method selection (from configurable list)
- Order saved to database on payment
- Stock deducted on payment
- Split payment support (multiple methods per order)
- `[DEFERRED]` Discount support (percentage or fixed amount, per-item or per-order)

### 8.8 Receipt

- Order summary: company info, items, quantities, prices, totals
- QR code on receipt
- Printing: browser print dialog (web) + direct ESC/POS thermal printing (Tauri desktop)
- Digital receipt option
- `[DEFERRED]` Customizable receipt template (hardcoded format for now)

### 8.9 Cash Register / Shift Management

- Open shift: set opening balance
- Close shift: count closing balance, system calculates expected vs actual
- Z-report generation
- Shift handoff between cashiers
- **Shifts are configurable per company** -- can be required or optional via company settings

---

## 9. Orders & Sales

### 9.1 Order Persistence

- Every POS sale creates an order record
- Order number auto-generated
- Order status: Completed, Voided, Returned
- Links to: payment method, cashier, shift, order items

### 9.2 Order History

- Searchable order list: date range, order number, cashier, status
- Order detail view: items, quantities, prices, payment info, receipt reprint

### 9.3 Returns / Voids

- Void an order (full cancellation, stock returned)
- **Reason required** for void/return (select from list or free text)
- No time limit on voids -- any past order can be voided
- Partial return (select items to return, stock adjusted)

### 9.4 Sales Analytics

- Daily/weekly/monthly sales totals
- Top-selling products
- Sales by category
- Sales by payment method
- Sales by cashier
- Hourly sales heatmap

---

## 10. Purchase & Invoices

### 10.1 Invoice Types

- Purchase (AL): goods received from supplier
- Sales (ST): goods sold to customer

### 10.2 Invoice Number

- Auto-generated: `AL-YYYY-NNNNNN` (purchase) / `ST-YYYY-NNNNNN` (sales)

### 10.3 Invoice Fields

| Field                  | Detail                                   |
| ---------------------- | ---------------------------------------- |
| Invoice number         | Auto-generated, unique per company       |
| Type                   | Purchase or Sales                        |
| Contact                | Supplier or customer (required)          |
| Date, due date         | Invoice date and payment due date        |
| Currency               | From company's configured currencies     |
| Exchange rate          | Manual entry when currency != base       |
| Tax number, tax office | From the contact                         |
| Status                 | Draft, Pending, Paid, Overdue, Cancelled |
| Notes                  | Free text                                |

### 10.4 Line Items

- Product (optional link), product name, quantity, unit, unit price, VAT rate
- Auto-calculated: line total, VAT amount, total with VAT

### 10.5 Invoice Totals

- Auto-calculated: subtotal, total VAT, total amount
- Displayed in invoice currency + base currency equivalent

### 10.6 Side Effects

| Event                    | Effect                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| Purchase invoice created | Stock IN, product lastPurchasePrice updated, contact balance increased |
| Sales invoice created    | Contact balance decreased                                              |
| Invoice updated          | Old stock reversed + new created, balance recalculated                 |
| Invoice deleted          | Balance reversed                                                       |

### 10.7 Invoice List

- Filter by type, status, date range, currency
- Segmented tabs, sortable columns

### 10.8 Invoice Dashboard

- Summary cards: total purchases, total sales, outstanding amounts

### 10.9 Deferred Features

- `[DEFERRED]` Partial payments (track payment amounts against invoice total)
- `[DEFERRED]` Invoice OCR (AI-powered invoice scanning and parsing via Google Gemini)

---

## 11. Contacts & Ledger (Cari Hesap)

### 11.1 Contact Types

- Supplier, Customer, Both

### 11.2 Contact Fields

| Field                  | Detail                                    |
| ---------------------- | ----------------------------------------- |
| Name                   | Unique per company                        |
| Contact person         | Optional                                  |
| Type                   | Supplier / Customer / Both                |
| Tax number, tax office | For invoicing                             |
| Phone, email           | Contact details                           |
| Address                | City, district, postal code, country      |
| Balance                | Positive = receivable, Negative = payable |
| Credit limit           | Optional. Warn when exceeded.             |
| Notes                  | Free text                                 |
| Status                 | Active / Inactive                         |

### 11.3 Credit Limits

- Optional credit limit field per contact
- When creating an invoice that would push balance beyond the limit, system shows warning
- **Warn only -- does not block** the invoice creation
- Useful for financial discipline with suppliers and customers

### 11.4 Balance Management

| Event                    | Effect                           |
| ------------------------ | -------------------------------- |
| Purchase invoice created | Balance increases (you owe more) |
| Sales invoice created    | Balance decreases (they owe you) |
| Invoice updated          | Old reversed, new applied        |
| Invoice deleted          | Reversed                         |
| Manual payment recorded  | Balance adjusted                 |

### 11.5 Financial Summary

- Total receivables, total payables, net cash flow
- Contact counts by type

### 11.6 Payment Recording

- Record payments to/from contacts, updates balance

### 11.7 Account Statement

- Per-contact transaction history with date filtering
- **Excel export** for sharing with contacts

### 11.8 Delete Protection

- Cannot delete if invoices linked

---

## 12. Transactions

### 12.1 Transaction Records

- Dedicated transactions table
- Every payment, receipt, invoice, and manual adjustment creates a transaction
- Fields: contact, type (invoice/payment/receipt/purchase), amount, date, **payment method**, reference, balance after

### 12.2 Configurable Payment Methods

- Admin defines available payment methods (e.g., Cash, Bank Transfer, Credit Card, Check)
- One payment method marked as default
- Each transaction selects a payment method
- Enables reporting by payment method

### 12.3 Transaction History

- Full chronological transaction log per contact
- Filterable by type, date range, payment method

---

## 13. Price Lists

### 13.1 Price List Fields

| Field               | Detail                              |
| ------------------- | ----------------------------------- |
| Name                | Display name                        |
| Channel type        | POS, Marketplace, Wholesale, Online |
| Marketplace channel | Required when type = Marketplace    |
| City                | Optional, for regional pricing      |
| Active / Inactive   | Toggle                              |
| Default             | Only one per company                |

### 13.2 Price List Items

- One product's price within a list: product, price, VAT rate, active/inactive
- Unique: one entry per product per price list

### 13.3 Default Price List

- Only one at a time, setting new clears previous
- Used for cost calculations and recipe analysis

### 13.4 POS Terminal Price List Assignment

- Each POS terminal/device is assigned a fixed price list
- Cashier cannot switch price lists during session
- Configured in POS settings

### 13.5 Business Rules

- Marketplace type requires active marketplace channel
- Deleting price list deletes all items
- `[DEFERRED]` Tiered/volume pricing (quantity breaks)

---

## 14. Marketplace Channels

- Code (unique per company, 2-200 chars), Name, Active/Inactive
- Referenced by price lists when channel type = Marketplace
- Channel must be active for assignment
- Deactivate / Delete available
- API integration planned (Trendyol, Hepsiburada, etc.) -- architecture should support future marketplace API connections for order sync, stock sync, price push

---

## 15. Scale Integration

### 15.1 Pluggable Scale Architecture

- Extensible protocol system -- abstract scale communication interface
- New scale brands can be added as protocol implementations
- CAS CL-3000 as the first (and initially only) implementation

### 15.2 Scale Connection

- CAS CL-3000 protocol via Web Serial API
- Configuration: serial port, baud rate, data bits, parity, stop bits
- Connect/disconnect controls

### 15.3 Weight Reading

- Weight value, unit, stability status, PLU code
- Auto-read mode at configurable intervals
- Weight normalized to KG

### 15.4 POS Integration

- Scale reading integrated into POS screen
- Auto-fill quantity for weighted products
- PLU code product lookup

### 15.5 Scale Test Page

- Development/testing page for scale connectivity

---

## 16. Reports & Analytics

### 16.1 Display

- **In-app interactive charts and tables** (recharts)
- Excel export button on every report

### 16.2 Sales Reports

- Daily/weekly/monthly sales summary
- Sales by product, category, payment method
- Top-selling products
- Sales trends over time

### 16.3 Stock Reports

- Current stock valuation
- Low stock alerts
- Stock movement summary by period
- Stock turnover rate

### 16.4 Financial Reports

- Revenue vs expenses
- Outstanding receivables/payables aging
- Contact balance summary
- Profit margin by product

### 16.5 Production Reports

- Production volume by product
- Material consumption summary
- Production cost analysis

### 16.6 Export

- All reports exportable to Excel (xlsx)
- `[DEFERRED]` PDF export option

---

## 17. Settings

**All settings require admin role.**

| Section                           | Detail                                                     |
| --------------------------------- | ---------------------------------------------------------- |
| Company profile                   | Name, tax info, logo, address                              |
| User management                   | CRUD users, assign roles and permissions                   |
| Marketplace channels              | Manage sales channels                                      |
| Price lists                       | Manage price lists and items                               |
| General settings                  | Default tax rate, currencies, exchange rates, locale        |
| POS settings                      | Terminal price list assignment, payment methods, shift mode |
| Stock settings                    | Default min levels, unit precision config, movement sources |
| Payment method config             | Define available payment methods, set default              |
| Notification settings             | Low stock alerts, overdue invoice alerts                   |
| `[DEFERRED]` Accounting settings  | For future accounting integration                          |
| `[DEFERRED]` Integration settings | For future e-invoice, marketplace APIs                     |
| `[DEFERRED]` Receipt template     | Customizable receipt layout                                |

---

## 18. Dashboard

### 18.1 Overview Widgets

- Today's sales total
- Low stock alerts count
- Outstanding receivables / payables
- Today's production summary
- Recent orders
- Sales trend chart (last 7/30 days)

### 18.2 Layout

- **Fixed layout** -- not customizable
- **Admin-only** -- dashboard visible only to admin role

### 18.3 Quick Actions

- Navigation hub to all modules
- Quick links: new sale, new invoice, new production

---

## 19. Super Admin Panel

### 19.1 Scope

- Separate from company-level admin
- For platform-level management (system operator)

### 19.2 Features (Minimal)

- Company list with user counts
- Create / deactivate companies
- View users across all companies
- `[DEFERRED]` System health, API logs, background job status, feature flags

---

## 20. Internationalization

### 20.1 Supported Languages

- Turkish (TR) and English (EN) from day 1
- Full i18n for all UI strings

### 20.2 Language Resolution

1. `user.metadata.preferred_language` (if set) overrides company default
2. Company default language (set in company settings)
3. Fallback: English

### 20.3 Backend i18n

- `x-app-language` request header for error message localization
- API error messages returned in the requested language

---

## 21. Notifications

### 21.1 Delivery

- **In-app only** -- bell icon with notification list
- No email or push notifications (for now)

### 21.2 Notification Types

- Low stock alerts (product at or below minimum level)
- Overdue invoice alerts (past due date, unpaid)

---

## 22. Audit Trail

### 22.1 Scope

- **All entities audited** -- products, invoices, contacts, orders, stock, production, settings
- Field-level audit trail: field, old value, new value, who, when, change type

### 22.2 Implementation

- Non-blocking -- audit writes happen in a background thread
- Does not slow down the main request/response cycle
- Reference implementation: Athena project (`/Users/meer/Developer/ls/gaia/athena`)

### 22.3 Viewing

- Per-entity history modal showing chronological changes
- Filterable by date range and user

---

## Implementation Priority

### Phase 1 (Core)

1. Auth & Users (multi-company, i18n)
2. Company Management (multi-currency, multi-tax)
3. Product Catalog + Categories
4. Stock Management (with stock counting)
5. Price Lists + Marketplace Channels
6. POS (order persistence, stock deduction, cart persistence, park/retrieve, keyboard shortcuts)
7. Orders & Sales (with void/return)
8. Dashboard (basic, admin-only)
9. Super Admin Panel (minimal)

### Phase 2 (Business Operations)

10. Recipes & BOM (variant pricing, drag & drop)
11. Production / Cooking Workflow (mobile-first, batch sessions)
12. Purchase & Invoices (multi-currency)
13. Contacts & Ledger (credit limits)
14. Transactions (configurable payment methods)
15. Settings (all working sections)
16. Notifications (in-app)

### Phase 3 (Intelligence & Polish)

17. Reports & Analytics (in-app charts + Excel)
18. Scale Integration (pluggable architecture)
19. Cash Register / Shift Management
20. Barcode Scanning
21. Split Payment

### Deferred (Future)

- Discounts (per-item, per-order)
- Invoice OCR (AI via Google Gemini)
- Partial payments
- Tiered pricing
- Bulk product import from Excel
- Receipt template customization
- Marketplace API integrations
- Self-service company onboarding
- PDF report export
