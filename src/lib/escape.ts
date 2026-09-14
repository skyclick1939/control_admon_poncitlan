const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML-escapes a string so it can be safely embedded in innerHTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Sets an element's text content directly. `textContent` is never parsed as
 * markup by the DOM, so this is the safe alternative to `innerHTML` for
 * plain-text updates.
 */
export function setText(element: { textContent: string | null }, text: string): void {
  element.textContent = text;
}
