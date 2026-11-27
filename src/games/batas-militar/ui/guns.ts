/**
 * Gun artwork, used in soldiers' hands, as world pickups and as HUD icons.
 * Local space: the hand grip is at (0, 0) and the barrel points along +x. Units are world pixels.
 * Realistic proportions and materials (blued steel, polymer, wood, olive drab), thin dark linework.
 */
import { BAZOOKA, LASER, NADE, PISTOL, RIFLE, SHOTGUN, SMG, SNIPER } from "..";
import type { G } from "./art";

type Pt = readonly [number, number];
const TAU = Math.PI * 2;
const LINE = "rgba(8,8,10,0.9)";

/** Vertical shading: a lit top edge fading to a darker underside, like a rounded metal or polymer part. */
function shade(g: G, y0: number, y1: number, top: string, mid: string, bot: string) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, top); gr.addColorStop(0.45, mid); gr.addColorStop(1, bot);
  return gr;
}
function poly(g: G, pts: readonly Pt[], fill: string | CanvasGradient, stroke = true) {
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (stroke) g.stroke();
}
function box(g: G, x: number, y: number, w: number, h: number, fill: string | CanvasGradient, r = 0.8, stroke = true) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  g.fillStyle = fill; g.fill();
  if (stroke) g.stroke();
}
function line(g: G, pts: readonly Pt[], color: string, w = 0.6) {
  g.beginPath(); g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  g.strokeStyle = color; g.lineWidth = w; g.stroke();
  g.strokeStyle = LINE; g.lineWidth = 0.8;
}
/** A row of small slots (vents, rail notches, grip texture). */
function slots(g: G, x0: number, x1: number, y: number, w: number, h: number, step: number, color: string) {
  g.fillStyle = color;
  for (let x = x0; x <= x1 - w; x += step) g.fillRect(x, y, w, h);
}
function glint(g: G, x0: number, x1: number, y: number, a = 0.55) {
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.fillRect(x0, y, x1 - x0, 0.6);
}

/* Material palettes. */
const STEEL = (g: G, y0: number, y1: number) => shade(g, y0, y1, "#7d8590", "#3d434b", "#1d2126");
const BLUED = (g: G, y0: number, y1: number) => shade(g, y0, y1, "#5a6170", "#2b3039", "#14171c");
const POLY = (g: G, y0: number, y1: number) => shade(g, y0, y1, "#4a4d52", "#26282c", "#141518");
const WOOD = (g: G, y0: number, y1: number) => shade(g, y0, y1, "#b07a45", "#7d4e28", "#4f2f17");
const TAN = (g: G, y0: number, y1: number) => shade(g, y0, y1, "#9c936a", "#6f6847", "#454029");
const OD = (g: G, y0: number, y1: number) => shade(g, y0, y1, "#7c8a56", "#56623a", "#323a22");

function grip(g: G, x: number, y: number, h = 8, fill?: CanvasGradient) {
  poly(g, [[x, y], [x + 4.2, y], [x + 3, y + h], [x - 1.4, y + h - 0.4]], fill ?? POLY(g, y, y + h));
  g.fillStyle = "rgba(255,255,255,0.08)";
  for (let k = 1.5; k < h - 1; k += 1.5) g.fillRect(x - 0.6 + k * 0.15, y + k, 3.4, 0.5);
}
function triggerGuard(g: G, x: number, y: number) {
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x, y + 4.2, x + 3.5, y + 4.2); g.lineTo(x + 5.5, y + 4.2); g.lineTo(x + 5.5, y);
  g.lineWidth = 0.9; g.strokeStyle = "#1a1c20"; g.stroke();
  g.beginPath(); g.moveTo(x + 2.4, y); g.quadraticCurveTo(x + 3.4, y + 1.6, x + 2.6, y + 3); g.stroke();
  g.strokeStyle = LINE; g.lineWidth = 0.8;
}

/** Muzzle distance from the grip, so flashes and beams start at the barrel tip. */
export const MUZZLE = [18, 38, 23, 52, 31, 33, 35] as const;
/** Bounding box of each gun, for fitting icons: [x0, y0, x1, y1]. */
export const GUN_BOX: Record<number, readonly [number, number, number, number]> = {
  [PISTOL]: [-4, -7, 19, 11], [RIFLE]: [-19, -10, 36, 14], [SHOTGUN]: [-20, -6, 39, 9], [SMG]: [-15, -8, 24, 15],
  [SNIPER]: [-21, -15, 53, 9], [LASER]: [-10, -10, 33, 10], [BAZOOKA]: [-26, -14, 35, 13], [NADE]: [-6, -11, 7, 8],
};

function rifle(g: G) {
  // Polymer stock with a rubber buttpad.
  poly(g, [[-4, -4.6], [-17, -3.6], [-18.5, -3.6], [-18.5, 5.2], [-16.5, 5.6], [-4, 1.2]], POLY(g, -4.6, 5.6));
  box(g, -19.2, -3.8, 1.6, 9.2, "#101114", 0.5);
  line(g, [[-15, -2.6], [-6, -3.2]], "rgba(255,255,255,0.12)", 0.8);
  // Pistol grip and trigger guard under the receiver.
  grip(g, -0.6, 2.2, 8.6);
  triggerGuard(g, 3.4, 2.2);
  // Curved magazine with ribs.
  g.beginPath(); g.moveTo(7, 2.2); g.lineTo(12, 2.2); g.quadraticCurveTo(13.6, 8, 12.6, 13.6); g.lineTo(8.4, 13.2); g.quadraticCurveTo(9.2, 7.6, 7, 2.2); g.closePath();
  g.fillStyle = POLY(g, 2, 14); g.fill(); g.stroke();
  line(g, [[8.6, 6], [12.8, 6]], "rgba(255,255,255,0.1)"); line(g, [[9, 9.6], [13, 9.6]], "rgba(255,255,255,0.1)");
  // Lower and upper receiver.
  box(g, -4, -1.4, 17, 3.8, BLUED(g, -1.4, 2.4), 0.6);
  box(g, -4.4, -5.6, 19, 4.4, STEEL(g, -5.6, -1.2), 0.8);
  box(g, 6, -4.4, 4.6, 1.8, "#0b0c0e", 0.3, false); // ejection port
  box(g, 10.8, -4.1, 1.2, 1.2, "#2a2e33", 0.3, false); // forward assist
  box(g, -5.6, -5.4, 1.6, 1.2, "#2a2e33", 0.3); // charging handle
  // Picatinny rail.
  box(g, -3, -7.2, 18, 1.7, "#22252a", 0.3);
  slots(g, -2.4, 15, -7.2, 0.9, 0.9, 1.9, "#0d0e10");
  // Handguard with vents.
  box(g, 15, -5.4, 11, 6.6, POLY(g, -5.4, 1.2), 1.4);
  slots(g, 16.4, 25, -3.2, 1.6, 2.2, 2.6, "#0b0c0e");
  // Barrel, gas block / front sight, flash hider.
  box(g, 26, -3, 7, 2.2, STEEL(g, -3, -0.8), 0.4);
  poly(g, [[24.6, -5.4], [25.4, -9.6], [26.6, -9.6], [27.6, -5.4]], "#1b1d21");
  box(g, 32.6, -3.6, 3.4, 3.4, BLUED(g, -3.6, -0.2), 0.4);
  slots(g, 33.2, 36, -3.6, 0.6, 1.2, 1.1, "#050506");
  // Rear sight.
  box(g, 0.6, -9.4, 3.6, 2.2, "#1b1d21", 0.4);
  glint(g, -3.8, 14.2, -5.1); glint(g, 15.6, 25.4, -4.9, 0.25); glint(g, 26.4, 32.4, -2.7, 0.4);
}

function pistol(g: G) {
  // Polymer frame and grip, steel slide with serrations, short barrel.
  grip(g, -1.6, 1.4, 9);
  triggerGuard(g, 2.4, 1.4);
  box(g, -2.6, -1.4, 16, 3.4, POLY(g, -1.4, 2), 0.8); // frame + dust cover
  box(g, 11.6, -0.4, 2, 1.6, "#1d1f23", 0.3); // accessory rail nub
  box(g, -3.4, -5.6, 18.4, 4.6, STEEL(g, -5.6, -1), 1); // slide
  for (let x = -2.2; x < 2.4; x += 1.1) line(g, [[x, -5.2], [x, -1.4]], "rgba(0,0,0,0.55)", 0.5); // rear serrations
  box(g, 5.6, -4.8, 3.6, 1.6, "#0a0b0d", 0.3, false); // ejection port
  box(g, 15, -4.2, 3.2, 2.4, BLUED(g, -4.2, -1.8), 0.4); // barrel crown
  box(g, -2.8, -7, 1.8, 1.4, "#16181b", 0.2); box(g, 12.6, -7, 1.2, 1.4, "#16181b", 0.2); // sights
  box(g, -4.6, -4, 1.4, 2, "#2a2e33", 0.3); // hammer
  glint(g, -3, 14.6, -5.1, 0.6);
}

function shotgun(g: G) {
  // Walnut stock with grain.
  g.beginPath(); g.moveTo(-4, -4); g.lineTo(-18, -2.2); g.quadraticCurveTo(-20, -2, -20, 0); g.lineTo(-20, 5.4); g.lineTo(-17, 5.8); g.quadraticCurveTo(-10, 3.6, -4, 2.4); g.closePath();
  g.fillStyle = WOOD(g, -4, 6); g.fill(); g.stroke();
  line(g, [[-17, -0.6], [-8, -1.8]], "rgba(40,20,8,0.55)"); line(g, [[-18, 2.2], [-7, 0.6]], "rgba(40,20,8,0.45)"); line(g, [[-15, 3.8], [-6, 1.8]], "rgba(255,220,170,0.18)");
  box(g, -20.6, -2.2, 1.4, 8, "#1a1310", 0.4);
  grip(g, -1.4, 2, 6.6, WOOD(g, 2, 9));
  triggerGuard(g, 2.6, 2.2);
  // Receiver.
  box(g, -4.2, -4.6, 15, 6.8, BLUED(g, -4.6, 2.2), 1);
  box(g, 3, -3.4, 5, 1.6, "#0a0b0d", 0.3, false);
  // Barrel over magazine tube.
  box(g, 10.6, -4.2, 27, 2.8, STEEL(g, -4.2, -1.4), 0.5);
  box(g, 10.6, -1.2, 23, 2.4, BLUED(g, -1.2, 1.2), 0.5);
  box(g, 32.6, -1.6, 1.6, 3, "#1b1d21", 0.3); // barrel band
  g.beginPath(); g.arc(37, -4.6, 0.8, 0, TAU); g.fillStyle = "#d9c08a"; g.fill(); // bead sight
  // Pump forend.
  box(g, 15, -2, 11, 5, WOOD(g, -2, 3), 1.2);
  for (let x = 16.4; x < 25; x += 1.6) line(g, [[x, -1.4], [x, 2.4]], "rgba(30,15,5,0.6)", 0.5);
  glint(g, -3.8, 10.4, -4.2); glint(g, 11, 37, -3.8, 0.4); glint(g, 15.4, 25.6, -1.6, 0.25);
}

function smg(g: G) {
  // Folding wire stock.
  g.beginPath(); g.moveTo(-4, -3.6); g.lineTo(-14, -3.4); g.lineTo(-14.6, 3.4); g.lineTo(-4, 1.6);
  g.lineWidth = 1.6; g.strokeStyle = "#16181b"; g.stroke(); g.lineWidth = 0.8; g.strokeStyle = LINE;
  box(g, -15.4, -4, 1.8, 8, "#16181b", 0.5);
  grip(g, -0.8, 2.4, 7.6);
  triggerGuard(g, 3.2, 2.4);
  // Straight stick magazine.
  poly(g, [[5.6, 2.4], [9.4, 2.4], [10.4, 15], [6.8, 15]], POLY(g, 2, 15));
  line(g, [[6.4, 6], [9.8, 6]], "rgba(255,255,255,0.1)"); line(g, [[6.8, 10], [10.2, 10]], "rgba(255,255,255,0.1)");
  // Receiver body.
  box(g, -4.4, -5.4, 19.4, 7.8, POLY(g, -5.4, 2.4), 1.4);
  box(g, 3, -3.6, 4.4, 1.6, "#09090b", 0.3, false);
  box(g, -3.6, -7.2, 14, 1.6, "#1d1f23", 0.3);
  slots(g, -3, 10.6, -7.2, 0.8, 0.8, 1.7, "#0b0c0e");
  // Vertical foregrip.
  poly(g, [[11, 2.4], [13.8, 2.4], [13.4, 9], [11.4, 9]], POLY(g, 2.4, 9));
  // Barrel and compensator.
  box(g, 15, -2.6, 6, 2, STEEL(g, -2.6, -0.6), 0.4);
  box(g, 20.4, -3.2, 3, 3.2, BLUED(g, -3.2, 0), 0.5);
  box(g, 0.4, -9.2, 2.6, 2, "#1b1d21", 0.3); box(g, 11, -9, 1.6, 1.8, "#1b1d21", 0.3);
  glint(g, -3.8, 14.4, -5, 0.35); glint(g, 15.4, 20.4, -2.3, 0.4);
}

function sniper(g: G) {
  // Synthetic thumbhole stock with cheek riser.
  g.beginPath();
  g.moveTo(-2, -4.2); g.lineTo(-12, -4.6); g.lineTo(-13, -7); g.lineTo(-19.4, -6.6); g.lineTo(-20.6, -4); g.lineTo(-20.6, 5.6); g.lineTo(-18, 6);
  g.lineTo(-9, 2.4); g.quadraticCurveTo(-6, 7.6, -1.8, 8.4); g.lineTo(0.4, 1.6); g.closePath();
  g.fillStyle = TAN(g, -7, 8.4); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(-6.4, 2.4, 2.4, 1.6, -0.3, 0, TAU); g.fillStyle = "#1c1a12"; g.fill(); // thumbhole
  box(g, -21.4, -4.4, 1.4, 10.6, "#121212", 0.4);
  triggerGuard(g, 1.6, 1.6);
  // Detachable box magazine.
  box(g, 6.4, 0.6, 5.4, 4.6, POLY(g, 0.6, 5.2), 0.6);
  // Action / receiver.
  box(g, -2.4, -4.8, 17.4, 5.4, STEEL(g, -4.8, 0.6), 0.9);
  box(g, 4, -3.8, 4.8, 1.4, "#0a0b0d", 0.3, false);
  // Bolt handle with knob.
  line(g, [[3.2, -1.4], [4.6, 2.6]], "#2c3036", 1.4);
  g.beginPath(); g.arc(4.9, 3.2, 1.4, 0, TAU); g.fillStyle = "#24272c"; g.fill(); g.stroke();
  // Heavy fluted barrel tapering to a muzzle brake.
  poly(g, [[15, -4], [47, -3.1], [47, -1.1], [15, -0.2]], STEEL(g, -4, -0.2));
  line(g, [[17, -2.2], [44, -2.1]], "rgba(0,0,0,0.45)", 0.5);
  box(g, 46.6, -4.2, 6, 4.4, BLUED(g, -4.2, 0.2), 0.6);
  slots(g, 47.6, 52, -3.8, 0.9, 1.2, 1.6, "#050506"); slots(g, 47.6, 52, -1.6, 0.9, 1.2, 1.6, "#050506");
  // Folded bipod under the fore-end.
  line(g, [[19, 0], [27, 3.6]], "#1e2024", 1.1); line(g, [[20, 0], [29, 2.6]], "#1e2024", 1.1);
  // Scope: rings, tube, objective and ocular bells, turrets, lens.
  box(g, 1.4, -8.4, 2.2, 3.8, "#16181b", 0.3); box(g, 11.4, -8.4, 2.2, 3.8, "#16181b", 0.3);
  box(g, -1, -12, 21, 3.6, BLUED(g, -12, -8.4), 1.6);
  poly(g, [[19, -12], [22.6, -13.6], [22.6, -6.6], [19, -8.4]], BLUED(g, -13.6, -6.6));
  poly(g, [[-0.4, -12], [-3.6, -13], [-3.6, -7.4], [-0.4, -8.4]], BLUED(g, -13, -7.4));
  box(g, 7.4, -14.6, 3, 2.6, "#1b1d22", 0.4); box(g, 8, -15.2, 1.8, 0.8, "#2c3036", 0.2);
  g.beginPath(); g.ellipse(22.8, -10.1, 0.9, 3.3, 0, 0, TAU);
  const lens = g.createLinearGradient(22, -13.4, 23.6, -6.8); lens.addColorStop(0, "#bfe8ff"); lens.addColorStop(0.5, "#3a6fa8"); lens.addColorStop(1, "#0d1d33");
  g.fillStyle = lens; g.fill(); g.stroke();
  glint(g, -0.4, 19.4, -11.5, 0.5); glint(g, -2, 14.4, -4.5, 0.45); glint(g, 16, 46, -3.7, 0.35);
}

function laser(g: G, t: number) {
  const glow = 0.65 + 0.35 * Math.sin(t * 6);
  // Brushed-alloy body: a tapered, machined shell.
  poly(g, [[-9, -4.2], [-6, -6.4], [14, -6.4], [18, -4.4], [18, 1.6], [-9, 1.6]], shade(g, -6.4, 1.6, "#eef2f5", "#b8c1ca", "#6f7a85"));
  box(g, -10, -4.6, 2.2, 6.8, "#3a4048", 0.6);
  grip(g, -0.8, 1.6, 7.6, shade(g, 1.6, 9, "#5b636d", "#353b42", "#1d2125"));
  triggerGuard(g, 3.2, 1.6);
  // Battery pack with charge LEDs.
  box(g, 6.6, 1.6, 6, 5, shade(g, 1.6, 6.6, "#5b636d", "#353b42", "#1d2125"), 0.8);
  for (let i = 0; i < 4; i++) { g.fillStyle = i < 3 ? `rgba(90,240,255,${glow})` : "#24414a"; g.fillRect(7.4 + i * 1.3, 3.6, 0.9, 1.2); }
  // Heat-sink fins.
  for (let x = -4; x < 12; x += 2) box(g, x, -8.6, 1, 2.4, "#8f9aa5", 0.2, false);
  // Exposed coil section around the barrel.
  box(g, 18, -3.6, 9, 4.4, "#1e2328", 0.6);
  g.fillStyle = `rgba(80,230,255,${glow * 0.9})`; g.fillRect(18.6, -2.2, 7.8, 1.6);
  for (let x = 19; x < 27; x += 1.6) box(g, x, -4.4, 0.9, 6, "#b48a3c", 0.2, false); // copper windings
  // Emitter shroud and lens.
  poly(g, [[27, -4.6], [30.6, -3.6], [30.6, 0.8], [27, 1.8]], shade(g, -4.6, 1.8, "#d9e0e6", "#8b96a1", "#4d5660"));
  g.beginPath(); g.ellipse(30.8, -1.4, 0.9, 2.4, 0, 0, TAU); g.fillStyle = `rgba(150,245,255,${0.6 + 0.4 * glow})`; g.fill(); g.stroke();
  // Emissive glow around the coils and lens.
  g.save(); g.globalCompositeOperation = "lighter";
  const gr = g.createRadialGradient(24, -1.4, 0, 24, -1.4, 10); gr.addColorStop(0, `rgba(80,220,255,${0.35 * glow})`); gr.addColorStop(1, "rgba(80,220,255,0)");
  g.fillStyle = gr; g.fillRect(14, -11, 20, 20);
  g.restore();
  box(g, 1, -5.2, 6, 2.4, "#0f2a33", 0.4); // status screen
  g.fillStyle = `rgba(90,240,255,${glow})`; g.fillRect(1.6, -4.6, 3.6 * glow, 1.2);
  glint(g, -6, 13.6, -5.8, 0.8);
}

function bazooka(g: G) {
  // Launch tube (olive drab steel) with a flared rear venturi.
  box(g, -20, -5.4, 41, 10, OD(g, -5.4, 4.6), 2);
  poly(g, [[-20, -5], [-25.6, -7], [-25.6, 6.4], [-20, 4.4]], shade(g, -7, 6.4, "#3a3d36", "#1d1f1a", "#0c0d0b"));
  g.beginPath(); g.ellipse(-25.6, -0.3, 1.2, 6.6, 0, 0, TAU); g.fillStyle = "#050505"; g.fill(); g.stroke();
  // Canvas heat shield wrap and reinforcing bands.
  box(g, -6, -6, 12, 11.2, shade(g, -6, 5.2, "#8a7a55", "#6b5d3e", "#43391f"), 1.4);
  for (let x = -4.6; x < 5; x += 2.2) line(g, [[x, -5.4], [x + 0.8, 4.6]], "rgba(30,25,10,0.5)", 0.5);
  box(g, -15, -5.8, 1.6, 10.8, "#2c3220", 0.3); box(g, 15, -5.8, 1.6, 10.8, "#2c3220", 0.3);
  // Pistol grip, trigger and front handgrip.
  grip(g, -2.6, 4.6, 8);
  triggerGuard(g, 1.4, 4.6);
  poly(g, [[9, 4.6], [12, 4.6], [11.6, 10.6], [9.4, 10.6]], POLY(g, 4.6, 10.6));
  // Optical sight on a side bracket.
  box(g, -1.4, -8, 3, 2.6, "#1d2018", 0.3);
  box(g, -3.4, -13, 10, 5, POLY(g, -13, -8), 1);
  g.beginPath(); g.ellipse(6.6, -10.5, 0.7, 1.9, 0, 0, TAU); g.fillStyle = "#6fa8d6"; g.fill(); g.stroke();
  // Loaded warhead: ogive nose cone over a tan body.
  poly(g, [[21, -3.6], [25, -6.6], [29, -6.6], [33.6, -2], [34.6, -0.4], [33.6, 1.2], [29, 5.8], [25, 5.8], [21, 2.8]], OD(g, -6.6, 5.8));
  line(g, [[25, -6.6], [25, 5.8]], "rgba(0,0,0,0.5)", 0.7);
  g.fillStyle = "#c9a54a"; g.fillRect(25.6, -5.6, 1.6, 10.4); // yellow HE band
  glint(g, -19, 20, -4.6, 0.35); glint(g, 25.4, 31, -5.8, 0.4);
  // Carry sling.
  g.beginPath(); g.moveTo(-14, 5); g.quadraticCurveTo(0, 13, 15, 5); g.strokeStyle = "rgba(40,36,24,0.85)"; g.lineWidth = 1; g.stroke();
}

function grenade(g: G) {
  g.beginPath(); g.ellipse(0, 1, 5.6, 6.8, 0, 0, TAU); g.fillStyle = OD(g, -6, 8); g.fill(); g.stroke();
  g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 0.6;
  for (const y of [-2.4, 1, 4.4]) { g.beginPath(); g.moveTo(-5.2, y); g.quadraticCurveTo(0, y + 1, 5.2, y); g.stroke(); }
  for (const x of [-2.4, 0.6, 3.4]) { g.beginPath(); g.moveTo(x, -5.4); g.quadraticCurveTo(x + 0.8, 1, x, 7.4); g.stroke(); }
  g.strokeStyle = LINE; g.lineWidth = 0.8;
  box(g, -2.4, -8.6, 4.8, 3.2, STEEL(g, -8.6, -5.4), 0.6);
  poly(g, [[2.2, -7.8], [4.6, -7.8], [6.2, 4], [4.8, 4]], STEEL(g, -8, 4)); // spoon
  g.beginPath(); g.arc(-3.6, -8.4, 2.2, 0, TAU); g.strokeStyle = "#a8adb3"; g.lineWidth = 0.8; g.stroke();
}

export function drawGun(g: G, w: number, t = 0) {
  g.save();
  g.lineJoin = "round"; g.lineCap = "round"; g.lineWidth = 0.8; g.strokeStyle = LINE;
  switch (w) {
    case PISTOL: pistol(g); break;
    case RIFLE: rifle(g); break;
    case SHOTGUN: shotgun(g); break;
    case SMG: smg(g); break;
    case SNIPER: sniper(g); break;
    case LASER: laser(g, t); break;
    case BAZOOKA: bazooka(g); break;
    case NADE: grenade(g); break;
  }
  g.restore();
}

/** A gun drawn into a small canvas, fitted and centred. Used by the HUD. */
export function drawGunIcon(c: HTMLCanvasElement, w: number, dim = false) {
  const dpr = window.devicePixelRatio || 1;
  const cw = c.clientWidth || 78, ch = c.clientHeight || 30;
  c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
  const g = c.getContext("2d");
  if (!g) return;
  const [x0, y0, x1, y1] = GUN_BOX[w] ?? GUN_BOX[PISTOL]!;
  const k = Math.min((cw - 4) / (x1 - x0), (ch - 4) / (y1 - y0));
  g.setTransform(dpr * k, 0, 0, dpr * k, dpr * (cw / 2 - ((x0 + x1) / 2) * k), dpr * (ch / 2 - ((y0 + y1) / 2) * k));
  if (dim) g.globalAlpha = 0.35;
  drawGun(g, w);
}
