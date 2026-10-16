# Again Builder — PC Builder admin guide

Focus: **PC Builder only** right now. CCTV / Laptop later.

Admin hub: **Catalog → Configuration → Builders**  
(after Plugins → **Again Builder** is installed)

Storefront: `/builders/pc-builder` (legacy `/pc-builder` redirects here)

---

## One-sentence model

> Builder **slot** slug = Catalog **category** slug → that category’s **published + public** products show in the storefront slot.

Example: slot `cpu` ← category slug `cpu` ← product “Intel Core i5-14400F”.

```text
Again Builder plugin
        ↓
Profile: PC Builder (slug: pc-builder)
        ↓
Slots: cpu, motherboard, memory, …
        ↓  (slug must match)
Catalog categories: cpu, motherboard, memory, …
        ↓
Catalog products (published + public)
        ↓
Storefront /builders/pc-builder
```

---

## Ready checklist (first time)

1. [ ] **Workspace → Plugins → Again Builder → Install**
2. [ ] PC Builder toggle **on** (others stay off / later)
3. [ ] **Open Builders admin** (or Catalog → Builders)
4. [ ] Profiles → **PC Builder** status **Active**
5. [ ] Categories → filter PC Builder → slots present (`cpu`, `memory`, …)
6. [ ] Catalog has categories with the **same slugs**
7. [ ] At least one published product per key slot
8. [ ] Open storefront `/builders/pc-builder` and confirm CPU list

Ops seed (optional): `python scripts/seed_builder_catalog.py --pack pc`

---

## End-to-end example (add one CPU)

### A) Profile (usually already exists)

| Field | Value |
|--------|--------|
| Name | PC Builder |
| Slug | `pc-builder` |
| Type | PC Builder |
| Status | Active |

Path: Builders → **Profiles**

Slots auto-seed when the PC profile is created/activated (CPU, Motherboard, Memory, …).

### B) Slot (configurator category)

| Field | Value |
|--------|--------|
| Profile | PC Builder |
| Name | CPU |
| Slug | `cpu` |
| Required | Yes |
| Selection | Single |
| Status | Active |

Path: Builders → **Categories** (filter profile = PC Builder)

You normally **do not** recreate these — they come from the PC slot pack.

### C) Catalog category (product bucket)

| Field | Value |
|--------|--------|
| Name | CPU |
| **Slug** | **`cpu`** (must match slot) |
| Channel | Catalog |
| Active | Yes |

Path: Catalog → **Categories**

Wrong slug (e.g. `erp-cpu` or `processors`) → storefront CPU slot stays empty or falls back to unreliable keyword match.

### D) Catalog product

| Field | Example |
|--------|--------|
| Name | Intel Core i5-14400F |
| Category | CPU (`cpu`) |
| Brand | Intel |
| Price | 22990 |
| Status | **Published** |
| Visibility | **Public** |
| Thumbnail | recommended |

Path: Catalog → **Products → Create**

### E) Result

1. Admin cannot “attach product to slot” separately — the **category slug** is the link.
2. Storefront → `/builders/pc-builder` → open **CPU** → product appears.
3. Customer picks CPU + other parts → save build / add to cart.

---

## PC Builder slot table

| Slot name | Slug | Required | Example product |
|-----------|------|----------|-----------------|
| CPU | `cpu` | yes | Intel Core i5-14400F |
| Motherboard | `motherboard` | yes | MSI MAG B650 Tomahawk WiFi |
| CPU Cooler | `cpu-cooler` | no | Cooler Master Hyper 212 |
| Memory | `memory` | yes | Corsair Vengeance 32GB DDR5 |
| Storage | `storage` | no | Samsung 990 PRO 1TB |
| Graphics Card | `graphics-card` | no | ASUS RTX 4060 8GB |
| Power Supply | `power-supply` | yes | Corsair RM750x |
| Casing | `casing` | yes | NZXT H5 Flow |
| Casing Cooler | `casing-cooler` | no | Deepcool FC120 3-Pack |
| Monitor | `monitor` | no | Samsung Odyssey G5 27" |
| Keyboard | `keyboard` | no | Keychron K2 Pro |
| Mouse | `mouse` | no | Logitech G502 X |
| Headphone | `headphone` | no | Sony WH-1000XM5 |
| UPS | `ups` | no | APC Back-UPS 1000VA |

Legacy aliases (API): `ram`→`memory`, `gpu`→`graphics-card`, `psu`→`power-supply`, `case`→`casing`, `cooler`→`cpu-cooler`.

---

## Day-to-day admin tasks

| Want to… | Do this |
|----------|---------|
| Add more CPUs | Catalog product → category `cpu` → publish |
| Hide a part from builder | Unpublish product **or** set visibility private |
| Reorder slots | Builders → Categories → edit sort order |
| Make Memory multi-select | Slot `memory` → selection mode **Multiple** (default pack already does) |
| Starter gaming PC | Builders → Templates → components mapped to product IDs |
| See customer builds | Builders → Saved Builds |
| AMD/Intel filter on storefront | Product name/brand should include AMD or Intel cues (platform detection) |

---

## Products missing on storefront?

- [ ] Again Builder installed + `pc-builder` enabled  
- [ ] Profile `pc-builder` **active**  
- [ ] Configurator slot status **active**  
- [ ] Catalog category **slug** exactly equals slot (`cpu`, not `CPU` path issues — slug is lowercase)  
- [ ] Product **published** + **public**  
- [ ] Product assigned to that category  
- [ ] Testing the same DB as live (local ≠ Railway)

---

## Naming (reference)

| Layer | Name |
|--------|------|
| Plugin | Again Builder (`again-builder`) |
| Admin | Builders |
| Profile | PC Builder / `pc-builder` |
| Storefront | `/builders/pc-builder` |

Other builders (CCTV, Laptop, …) — enable later from the plugin panel; same slug-matching rules apply.

---

## Compatibility: how two products match (CPU ↔ Motherboard example)

Compatibility is **not** “product A linked to product B”.  
It is: **each product has attributes** → **a rule compares those attributes**.

```text
Product A (CPU)     has attribute  socket = lga_1700
Product B (Mobo)    has attribute  socket = lga_1700
                              ↓
Rule: IF cpu.socket equals mobo.socket
  THEN compatible
  ELSE incompatible
```

### Where you add attributes (product specs)

1. **Catalog → Attributes** — create / open an attribute **profile** (template), e.g. `PC Components` or separate profiles for CPU / Motherboard / Memory  
2. Inside the profile: **Groups** → **fields**  
   - Example fields: `socket`, `ram_type`, `tdp`, `type` (DDR4/DDR5), `speed`  
3. **Catalog → Products → edit product → Specs tab**  
   - Select the attribute profile  
   - Fill values (e.g. Socket = `lga_1700`)  
   - Save / publish product  

Path shortcuts:
- Attribute templates: `/catalog/attributes`
- Product specs: `/catalog/products` → open product → **Specs**

### Where you add compatibility rules

1. **Catalog → Builders → Rules** (`/catalog/product-configurator/rules`)  
2. Create / edit a rule for **PC Builder**  
3. Rule shape:

| Part | Meaning |
|------|---------|
| **IF** conditions | Compare left attribute vs right attribute (or a fixed value) |
| **THEN** | If all IF true → `compatible` / `warning` / `incompatible` + message |
| **ELSE** | If IF false → usually `incompatible` |

Seeded examples already in the system:
- `socket_match` — CPU socket equals Motherboard socket  
- `ram_type_match` — Motherboard RAM type equals Memory type  
- `tdp_warning` — CPU TDP > 125 → warning  

### Full example — Intel build (compatible)

| Slot | Product | Attribute | Value |
|------|---------|-----------|--------|
| CPU | Intel Core i5-14400F | `socket` | `lga_1700` |
| Motherboard | ASUS PRIME Z790-P WIFI | `socket` | `lga_1700` |
| Motherboard | (same) | `ram_type` | `ddr5` |
| Memory | Corsair Vengeance 32GB DDR5 | `type` | `ddr5` |

**Rule 1 — Socket**  
IF `cpu.socket` equals `mobo.socket` → **compatible**  
(here both `lga_1700` → OK)

**Rule 2 — RAM**  
IF `mobo.ram_type` equals `ram.type` → **compatible**  
(here both `ddr5` → OK)

Customer can select all three on `/builders/pc-builder`.

### Full example — bad combo (incompatible)

| Slot | Product | Attribute | Value |
|------|---------|-----------|--------|
| CPU | AMD Ryzen 5 7600 | `socket` | `am5` |
| Motherboard | ASUS PRIME Z790-P WIFI | `socket` | `lga_1700` |

**Rule socket_match:** `am5` ≠ `lga_1700` → **incompatible**  
Message: “CPU socket does not match motherboard socket”.

### Step-by-step (admin checklist)

1. **Catalog → Attributes** — ensure fields exist (`socket`, `ram_type`, …)  
2. **Catalog → Products** — CPU product → Specs → set `socket`  
3. Same for Motherboard (`socket`, `ram_type`) and Memory (`type`)  
4. **Builders → Rules** — keep / create `socket_match`, `ram_type_match`  
5. Publish products + keep profile `pc-builder` active  
6. Test on storefront by picking both parts  

### Ready data (seeded on live)

**Attribute template:** Catalog → Attributes → **PC Builder Components**

| Group | Fields |
|-------|--------|
| CPU | Socket (`lga_1700` / `am5`), Platform, TDP |
| Motherboard | Socket, RAM Type (`ddr5`/`ddr4`), Platform, Chipset |
| Memory | Type, Speed |
| Cooler | Socket Support |
| Power Supply | Wattage |

**Two complete builds** (Builders → Templates, featured):

| Template | CPU | Motherboard | Memory | Key rule match |
|----------|-----|-------------|--------|----------------|
| **Intel Gaming PC (LGA1700)** | i5-14400F | ASUS Z790-P | Corsair DDR5-6000 | socket `lga_1700` + DDR5 |
| **AMD Gaming PC (AM5)** | Ryzen 5 7600 | MSI B650 Tomahawk | TeamGroup DDR5-5600 | socket `am5` + DDR5 |

Each template also picks cooler, storage, GPU, PSU, and case — 8 parts total.

Ops re-seed:

```bash
python scripts/seed_pc_builder_attributes.py --target live
```

### Important (current live behavior)

- **Product list in a slot** still comes from Catalog category slug (`cpu`, `motherboard`, …).  
- **AMD/Intel soft filter** on storefront can use name/brand hints.  
- Full IF/THEN rule evaluation against Catalog Specs is the admin rule model; keep attributes + rules filled so builds stay consistent as evaluation is wired end-to-end on the live storefront.
