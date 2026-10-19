export const BLOCK_FORMATS = [
  { value: "p", label: "Paragraph" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "h4", label: "Heading 4" },
] as const;

export type BlockFormat = (typeof BLOCK_FORMATS)[number]["value"];

const BLOCK_TAGS = new Set(BLOCK_FORMATS.map((item) => item.value));

/** True when the caret / selection sits inside `container` (several editors can be on one page). */
export function selectionInside(container: HTMLElement | null | undefined): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !container) return false;
  return container.contains(selection.getRangeAt(0).commonAncestorContainer);
}

/** Puts the caret at the end of `container` unless the selection is already inside it. */
export function ensureSelectionInside(container: HTMLElement | null | undefined): void {
  if (!container || selectionInside(container)) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(container);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function getCurrentBlockFormat(container: HTMLElement | null): BlockFormat {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !container) return "p";
  if (!container.contains(selection.getRangeAt(0).commonAncestorContainer)) return "p";

  let node: Node | null = selection.getRangeAt(0).commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }

  while (node && node !== container) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName.toLowerCase();
      if (BLOCK_TAGS.has(tag as BlockFormat)) {
        return tag as BlockFormat;
      }
    }
    node = node.parentElement;
  }

  return "p";
}

export function applyBlockFormat(tag: BlockFormat, container?: HTMLElement | null) {
  const selection = window.getSelection();

  // If we have a container and no selection (or the selection is in another editor), apply to first block in container
  if (container && (!selection || selection.rangeCount === 0 || !selectionInside(container))) {
    const firstBlock = container.querySelector([...BLOCK_TAGS].join(",")) as HTMLElement | null;
    if (firstBlock) {
      const replacement = document.createElement(tag);
      replacement.innerHTML = firstBlock.innerHTML;
      firstBlock.replaceWith(replacement);
    }
    return;
  }

  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  let node: Node | null = range.commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

  // Walk up to find the closest block-level element inside the editor
  const blockEl = (node as Element)?.closest(
    [...BLOCK_TAGS].join(","),
  ) as HTMLElement | null;

  if (!blockEl) {
    // No block found — wrap loose text nodes in new tag
    const wrapper = document.createElement(tag);
    // Move all child nodes of the contenteditable into the wrapper
    const editorEl = container ?? (node as Element)?.closest("[contenteditable]") as HTMLElement | null;
    if (editorEl) {
      while (editorEl.firstChild) wrapper.appendChild(editorEl.firstChild);
      editorEl.appendChild(wrapper);
    }
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    newRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(newRange);
    return;
  }

  // Replace existing block element with new tag
  const replacement = document.createElement(tag);
  replacement.innerHTML = blockEl.innerHTML;

  blockEl.replaceWith(replacement);

  // Restore cursor at end of replacement
  const newRange = document.createRange();
  newRange.selectNodeContents(replacement);
  newRange.collapse(false);
  selection.removeAllRanges();
  selection.addRange(newRange);
}
