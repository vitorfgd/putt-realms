/**
 * Swaps the first descendant `<img src>` while the button is visually pressed
 * (pointer down / up / leave / cancel / blur).
 */
export function bindImageButtonPressSpriteSwap(
  button: HTMLElement | null,
  normalSrc: string,
  pressedSrc: string,
): void {
  if (!button) return;
  const img = button.querySelector("img");
  if (!(img instanceof HTMLImageElement)) return;
  img.src = normalSrc;
  const reset = (): void => {
    img.src = normalSrc;
  };
  const press = (): void => {
    img.src = pressedSrc;
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", reset);
  button.addEventListener("pointerleave", reset);
  button.addEventListener("pointercancel", reset);
  button.addEventListener("blur", reset);
}
