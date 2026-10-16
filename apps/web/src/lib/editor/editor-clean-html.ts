/** Strip unsafe markup and Word-style cruft from editor HTML. */

import { normalizeEditorHtmlLinks } from "@/lib/editor/editor-link";

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "strike",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "img",
]);

const LINK_ATTRS = new Set(["href", "target", "rel"]);
const IMG_ATTRS = new Set(["src", "alt", "data-media-id", "class"]);
const IMG_CLASSES = new Set(["alignnone", "size-medium", "size-large", "size-full"]);

function stripUnsafeAttributes(element: Element) {
  [...element.attributes].forEach((attr) => {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on")) {
      element.removeAttribute(attr.name);
    }
  });
}

function cleanElementAttributes(element: Element) {
  const tag = element.tagName.toLowerCase();

  stripUnsafeAttributes(element);
  element.removeAttribute("style");
  element.removeAttribute("id");
  element.removeAttribute("dir");
  element.removeAttribute("face");
  element.removeAttribute("size");
  element.removeAttribute("color");
  element.removeAttribute("contenteditable");

  if (tag === "a") {
    [...element.attributes].forEach((attr) => {
      if (!LINK_ATTRS.has(attr.name.toLowerCase())) {
        element.removeAttribute(attr.name);
      }
    });
    return;
  }

  if (tag === "img") {
    [...element.attributes].forEach((attr) => {
      if (!IMG_ATTRS.has(attr.name.toLowerCase())) {
        element.removeAttribute(attr.name);
      }
    });
    const classes = (element.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter((cls) => IMG_CLASSES.has(cls));
    if (classes.length) element.setAttribute("class", classes.join(" "));
    else element.removeAttribute("class");
    return;
  }

  element.removeAttribute("class");
  [...element.attributes].forEach((attr) => {
    if (attr.name.toLowerCase().startsWith("data-")) {
      element.removeAttribute(attr.name);
    }
  });
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) {
    element.remove();
    return;
  }
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function isEmptyElement(element: Element) {
  const tag = element.tagName.toLowerCase();
  if (tag === "br" || tag === "img") return false;
  return !element.textContent?.replace(/\u00a0/g, " ").trim() && element.children.length === 0;
}

function cleanNodeTree(root: ParentNode, doc: Document) {
  const nodes = [...root.childNodes];

  for (const node of nodes) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const element = node as Element;
    const tag = element.tagName.toLowerCase();

    if (["script", "style", "iframe", "object", "embed", "form", "input", "button", "meta", "link"].includes(tag)) {
      element.remove();
      continue;
    }

    cleanNodeTree(element, doc);

    if (tag === "div") {
      const paragraph = doc.createElement("p");
      paragraph.innerHTML = element.innerHTML;
      element.replaceWith(paragraph);
      cleanNodeTree(paragraph, doc);
      continue;
    }

    if (tag === "span" || tag === "font" || !ALLOWED_TAGS.has(tag)) {
      unwrapElement(element);
      continue;
    }

    cleanElementAttributes(element);

    if (isEmptyElement(element)) {
      element.remove();
    }
  }
}

export function cleanEditorHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";

  if (typeof DOMParser === "undefined") {
    return normalizeEditorHtmlLinks(trimmed);
  }

  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  cleanNodeTree(doc.body, doc);

  let result = doc.body.innerHTML.trim();
  result = result.replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>");
  result = result.replace(/\u00a0/g, " ");

  return normalizeEditorHtmlLinks(result);
}
