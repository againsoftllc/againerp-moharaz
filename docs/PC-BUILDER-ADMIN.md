# PC Builder — Admin guide

See **[AGAIN-BUILDER.md](./AGAIN-BUILDER.md)** for the full PC Builder admin walkthrough with examples.

Quick path: Plugins → Again Builder → Catalog → **Builders** → follow the in-app guide.

## One workspace, linked to the storefront

- **Website → PC Builder** and **Workspace → Plugins → Smart PC Builder** show the same workspace (Overview, Tabs & Slots, Rules, Lookup & Alias, Overrides, Test Build, Ready Builds, Storefront, General); Website → PC Builder also lists the builder profiles.
- The storefront's `/pc-builder` reads the slots of the `pc-builder` profile (`GET /storefront/configurator/profiles/pc-builder`, cached for a minute): name, tab (`core-components` → Components, `peripherals` → Peripherals, any other tab → Extras), order, the catalog category each slot lists, required (shown on the overview even when empty) and single/multiple. A slot with no catalog category is not shown.
- Each build is also checked against the active **Rules** (`POST …/evaluate`). A failed rule shows as an error or warning on the storefront and replaces the page's own check on the same topic.
- To seed the profile with the storefront's 20 slots (or re-align after a fresh database), run `python -m scripts.sync_pc_builder_slots` (dry run), then add `--apply`. Existing slots keep their ids, and slots that aren't in the list are set inactive.
