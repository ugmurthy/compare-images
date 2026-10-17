export const OVERLAY_DURATION = 1600;

export function overlayOpacityAt(elapsed: number): number {
  return (1 - Math.cos((elapsed % OVERLAY_DURATION) / OVERLAY_DURATION * 2 * Math.PI)) / 2;
}
