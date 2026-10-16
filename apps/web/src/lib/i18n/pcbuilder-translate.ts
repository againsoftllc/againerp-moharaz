import { useLayoutEffect } from "react";
import { EXACT, PATTERNS, PHRASES } from "@/lib/i18n/pcbuilder-en";

// The taka sign (U+09F3) is the store currency, not text to translate.
export const BENGALI = /[ঀ-৲৴-৿]/;

/** Source texts keep HTML entities (&quot;, &amp;) in JSX; the DOM does not. */
const clean = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const EXACT_CLEAN: Record<string, string> = Object.fromEntries(Object.entries(EXACT).map(([k, v]) => [clean(k), v]));
// Longer patterns first, so the most specific sentence wins.
const PATTERNS_SORTED = [...PATTERNS].sort((a, b) => b[0].source.length - a[0].source.length);

/** English for one text, or the text itself when there is nothing to translate (or no entry for it). */
export function translateText(input: string): string {
  if (!BENGALI.test(input)) return input;
  const lead = input.match(/^\s*/)?.[0] ?? "";
  const tail = input.match(/\s*$/)?.[0] ?? "";
  const core = clean(input);
  const out = translateCore(core, 0);
  return out === core ? input : lead + out + tail;
}

function translateCore(core: string, depth: number): string {
  if (!BENGALI.test(core)) return core;
  const hit = EXACT_CLEAN[core];
  if (hit !== undefined) return hit;
  if (depth > 6) return core;
  for (const [re, tpl] of PATTERNS_SORTED) {
    const m = core.match(re);
    if (m) return tpl.replace(/\$(\d)/g, (_x, i) => translateCore((m[Number(i)] ?? "").trim(), depth + 1));
  }
  // no whole-text entry: swap the small known pieces inside it
  let out = core;
  for (const [from, to] of PHRASES) out = out.split(from).join(to);
  return out;
}

const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const SKIP = "script,style,textarea,[data-no-translate]";

function translateTextNode(node: Node) {
  const text = node.nodeValue;
  if (!text || !BENGALI.test(text)) return;
  const parent = node.parentElement;
  if (parent?.closest(SKIP)) return;
  const next = translateText(text);
  if (next !== text) node.nodeValue = next;
}

function translateAttributes(el: Element) {
  for (const name of ATTRS) {
    const v = el.getAttribute(name);
    if (v && BENGALI.test(v)) {
      const next = translateText(v);
      if (next !== v) el.setAttribute(name, next);
    }
  }
}

function sweep(start: Node) {
  if (start.nodeType === Node.TEXT_NODE) return translateTextNode(start);
  if (start.nodeType !== Node.ELEMENT_NODE) return;
  const root = start as Element;
  translateAttributes(root);
  root.querySelectorAll("[placeholder],[title],[aria-label],[alt]").forEach(translateAttributes);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    translateTextNode(n);
    n = walker.nextNode();
  }
}

/** While `enabled`, every Bangla text on the page (including sheets, dropdown options and toasts, which render outside
 * the panel) is shown in English. Only text nodes and a few attributes are rewritten, never elements, so React keeps
 * working; a text React updates later is translated again by the observer. Turning it off means re-creating the panel
 * (see SmartPcBuilderPluginPanel), which brings the Bangla back. */
export function useDomTranslator(enabled: boolean) {
  useLayoutEffect(() => {
    if (!enabled) return;
    const root = document.body;
    sweep(root);
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") translateTextNode(r.target);
        else if (r.type === "attributes") translateAttributes(r.target as Element);
        else r.addedNodes.forEach(sweep);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => observer.disconnect();
  }, [enabled]);
}
