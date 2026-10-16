# Send to AgainERP (Chrome extension)

Reads a competitor's product page in your own browser and saves its price and stock to
**Website → Price Compare**. Because the page is read in a real browser session, sites that
block server requests (for example a Cloudflare browser check) still work.

## How it reads the page

The extension tries these sources in order:

1. schema.org JSON-LD `Product` / `Offer`
2. microdata (`itemprop="price"`)
3. price meta tags
4. the visible price nearest the product title, skipping related products and EMI boxes

Stock comes from the schema `availability`, or from a "Status / Availability" label on the page.
You can correct the price, regular price or stock before saving.

## Install (load unpacked)

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and choose this `apps/browser-extension` folder.
3. Pin **Send to AgainERP** from the puzzle-piece menu.

## Use

1. Click the icon and sign in with an AgainERP admin account. Enter:
   - **API address**: `http://127.0.0.1:8050` locally, or your live API URL.
   - **Admin panel address**: used for the "Open Price Compare" link.

   Chrome asks once for access to the API address.
2. Open a product page on a shop, then click the icon. The popup shows:
   - the name, price and stock it read;
   - which competitor the page belongs to;
   - your matching products (likely matches are pre-selected). You can search for another one.
3. Click **Save price**. The match is saved as a manual link with the status
   "Captured from your browser". If the site isn't a competitor yet, tick **Add it as a competitor**.

## Auto-sync

In the popup, tick **Update saved competitor links automatically** and choose how often
(1–24 hours). Chrome asks once for access to your competitor sites; click **Allow**.

Settings in the popup:

- **Which links**
  - *Only sites that block the server* (default): only links the server couldn't read, plus stale
    links on a site that is blocking the server right now. The server updates every other site
    itself (Settings → Plugins → Price Compare → Automatic sync on the server).
  - *Every site*: every saved link.
- **Tabs at once** (1–5, default 3): how many pages the extension reads in parallel. There are
  never more than 3 tabs on one site, and pages on one site start at least 3 s apart. A site that
  starts showing bot checks drops to one tab.

How a page is read: the first page on a site loads in a tab on its own. That is where any bot
check gets passed, and the tab becomes the site's "anchor". Every later page on that site is fetched
from inside the anchor tab (same site, same cookies) and parsed in the background, so nothing new
loads in the tab. This takes about 1–2 s per page instead of 7–13 s. A page falls back to a full load
only if the fetch hits a bot check or shows no price, for example when the shop fills in prices with
JavaScript.

On each run (`background.js`):

1. The extension asks AgainERP which saved links are due. Failed or blocked links come first,
   then the ones unchecked for longest, up to 40 per run.
2. It opens the links in a minimized window with a small pool of tabs and reads them the same way
   as the popup. If a bot check doesn't clear, it reloads the page once.
3. It sends each result to AgainERP.

What gets saved:

- A link that now shows a different product, or is on another site, is flagged
  "fix the link" and its price is not saved.
- A failed read keeps the last good price.

The popup shows the last run's results, and the icon badge counts the problems.

Auto-sync only runs while Chrome is open. To keep prices current, leave Chrome open on one
office PC.

## Fallback for the ↻ button in Price Compare

Sometimes the server can't read a saved link, for example when the site shows a Cloudflare
browser check. When that happens and you click a cell's ↻ (or save a link from the link dialog),
the Price Compare page hands the link to the extension. The extension reads the link in the same
minimized window that auto-sync uses, and the cell updates with the result. This takes about
10–30 seconds, and a toast shows the progress.

If the cell has **no link yet** and the server is blocked, the extension finds the link:

1. It reads the competitor's `robots.txt` and sitemap files in your browser.
2. AgainERP matches the product against the sitemap with the same slug matching it uses for
   automatic discovery. AgainERP keeps the sitemap cached for 24 hours.
3. The extension opens up to 4 of the best pages. AgainERP checks each one: brand, model codes,
   sizes, variant and price range.
4. The first page that passes is saved as the link, together with its price.

The first time on a site takes about 30–40 seconds. Later products on that site take 5–20 seconds.

How it works:

- `bridge.js` is a content script that runs only on the **Admin panel address** set in the popup.
- The page sends `window.postMessage({source: "againerp-page", type: "sync-one", …})`.
- The extension answers with `sync-one-result`.

The Chrome access needed for this is asked for at sign-in, or by the **Allow** button under
Auto-sync.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/plugins/price-update/capture/lookup` | Takes `{url, title, price}`. Returns the competitor for the domain, products already linked to that page, and suggested products. |
| `POST /api/v1/plugins/price-update/capture` | Takes `{product_id, url, title, price, regular_price, in_stock, competitor?, add_competitor_label?}`. Saves the match. |
| `GET /api/v1/plugins/price-update/capture/queue?stale_hours=&limit=` | Lists the saved links due for an auto-sync re-read. |
| `POST /api/v1/plugins/price-update/capture/discover` | Takes `{product_id, competitor, documents}`. Returns either the sitemap files the browser should read next (`need`) or the best candidate pages (`candidates`). |
| `POST /api/v1/plugins/price-update/capture/discover/confirm` | Takes `{product_id, competitor, url, title, price, …}`. Checks the page the browser read and saves it as the link if it passes. Send `url: null` when no page passed. |
| `POST /api/v1/plugins/price-update/capture/auto` | Takes `{match_id, title, price, regular_price, in_stock, stock_label, error?}`. Saves one auto-sync result. |

None of these endpoints fetches the competitor site from the server.
