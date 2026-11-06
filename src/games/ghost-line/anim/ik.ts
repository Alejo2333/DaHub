export interface V {
  x: number;
  y: number;
}
/**
 * Two-bone inverse kinematics: given a hip and a foot target, finds the knee. Limbs always keep their length,
 * so a target out of reach gets a straight limb pointing at it. `side` picks which way the joint bends.
 */
export function twoBone(a: V, target: V, l1: number, l2: number, side: 1 | -1) {
  const dx = target.x - a.x,
    dy = target.y - a.y,
    raw = Math.hypot(dx, dy) || 0.0001,
    d = Math.min(l1 + l2 - 0.001, Math.max(Math.abs(l1 - l2) + 0.001, raw)),
    ux = dx / raw,
    uy = dy / raw,
    along = (l1 * l1 + d * d - l2 * l2) / (2 * d),
    h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return {
    joint: {
      x: a.x + ux * along - uy * h * side,
      y: a.y + uy * along + ux * h * side,
    },
    end: { x: a.x + ux * d, y: a.y + uy * d },
  };
}
