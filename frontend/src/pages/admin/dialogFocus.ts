/** Native modality makes the background inert; keep Tab within this app dialog too. */
export function containDialogFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget as HTMLDialogElement;
  const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"],a[href]')]
    .filter(item => item.getClientRects().length && !item.hidden);
  const first=items[0],last=items.at(-1);
  if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
  if (event.shiftKey && (document.activeElement===first || !dialog.contains(document.activeElement))) {
    event.preventDefault();last.focus();
  } else if (!event.shiftKey && (document.activeElement===last || !dialog.contains(document.activeElement))) {
    event.preventDefault();first.focus();
  }
}
