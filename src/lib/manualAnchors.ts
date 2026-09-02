export interface Point {
  x: number;
  y: number;
}

export interface ManualAnchor {
  id: number;
  ref: Point | null;
  src: Point | null;
}

export interface CompleteAnchor {
  id: number;
  ref: Point;
  src: Point;
}

export function completeAnchors(anchors: ManualAnchor[]): CompleteAnchor[] {
  return anchors
    .filter((anchor): anchor is CompleteAnchor => anchor.ref !== null && anchor.src !== null)
    .map((anchor) => ({ id: anchor.id, ref: anchor.ref, src: anchor.src }));
}
