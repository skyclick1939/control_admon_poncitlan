/**
 * Dependency-free clipboard helper (design.md D1 amendment). This module
 * imports NOTHING — it touches only the `navigator` and `document` browser
 * globals — so importing it into `src/public-view.ts` can never pull
 * supabase-js or the anon key into the public bundle.
 */

/**
 * Copies `text` to the system clipboard, resolving `true` on success and
 * `false` on any failure. Never throws and never rejects: clipboard access
 * can be denied, absent, or unavailable outside a secure context, and every
 * path degrades to `false` (spec public-clabe-copy: "fails gracefully without
 * throwing").
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Preferred path: async Clipboard API (secure contexts, modern browsers).
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Clipboard API rejected (permission denied, page unfocused, etc.).
        // Fall through to the legacy path instead of failing early.
      }
    }
    return legacyCopy(text);
  } catch {
    return false;
  }
}

/**
 * Legacy fallback: a transient off-screen textarea + `document.execCommand`.
 * `execCommand('copy')` is deprecated but remains the only copy path in
 * non-secure contexts (http) or older browsers without the async Clipboard
 * API. Restores the prior selection so copying does not clobber it.
 */
function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let succeeded = false;
  try {
    succeeded = document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
    if (selection && previousRange) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  }
  return succeeded;
}
