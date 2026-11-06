import type Phaser from "phaser";
import { SYMBOLS, WHEEL } from "../mechanics/payouts";
import { SIMPLE } from "../mechanics/simple";
import { wheelColor, WHEEL_ORDER } from "../ui/wheelLayout";

/**
 * All casino art is drawn in code on 2D canvases, so the game ships no image files.
 * Textures are drawn at S times their world size and displayed at 1/S, which keeps them sharp when the camera zooms.
 */
export const S = 2;
type C = CanvasRenderingContext2D;
const GOLD = "#ffc94a",
  GOLD_DARK = "#a8791c",
  WOOD = "#5a2d18",
  WOOD_DARK = "#32170b";
const DISPLAY_FONT = "Limelight,Georgia,serif";

function make(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (c: C) => void,
) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w * S, h * S)!;
  const c = t.context;
  c.scale(S, S);
  draw(c);
  t.refresh();
}
function rr(
  c: C,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
  stroke?: string,
  lw = 1,
) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}
function vgrad(c: C, y0: number, y1: number, ...stops: string[]) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}
function shadow(c: C, x: number, y: number, rx: number, ry: number) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = "rgba(0,0,0,.35)";
  c.fill();
}
function disc(
  c: C,
  x: number,
  y: number,
  r: number,
  fill: string | CanvasGradient,
  stroke?: string,
  lw = 1,
) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

function room(s: Phaser.Scene) {
  make(s, "carpet", 64, 64, (c) => {
    c.fillStyle = "#3b0f2a";
    c.fillRect(0, 0, 64, 64);
    c.strokeStyle = "rgba(255,201,74,.22)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(32, 2);
    c.lineTo(62, 32);
    c.lineTo(32, 62);
    c.lineTo(2, 32);
    c.closePath();
    c.stroke();
    c.strokeStyle = "rgba(176,124,255,.2)";
    c.beginPath();
    c.moveTo(32, 14);
    c.lineTo(50, 32);
    c.lineTo(32, 50);
    c.lineTo(14, 32);
    c.closePath();
    c.stroke();
    disc(c, 32, 32, 3, "rgba(255,201,74,.35)");
    for (const [x, y] of [
      [0, 0],
      [64, 0],
      [0, 64],
      [64, 64],
    ])
      disc(c, x!, y!, 4, "rgba(255,201,74,.2)");
  });
  make(s, "wall", 64, 104, (c) => {
    c.fillStyle = vgrad(c, 0, 72, "#170723", "#2c1045");
    c.fillRect(0, 0, 64, 72);
    c.strokeStyle = "rgba(255,201,74,.09)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(32, 14);
    c.bezierCurveTo(44, 24, 44, 40, 32, 50);
    c.bezierCurveTo(20, 40, 20, 24, 32, 14);
    c.stroke();
    c.fillStyle = vgrad(c, 72, 104, WOOD, WOOD_DARK);
    c.fillRect(0, 72, 64, 32);
    c.strokeStyle = "rgba(0,0,0,.4)";
    c.strokeRect(6, 78, 52, 20);
    c.fillStyle = GOLD;
    c.fillRect(0, 70, 64, 2);
    c.fillStyle = GOLD_DARK;
    c.fillRect(0, 102, 64, 2);
  });
  make(s, "runner", 32, 32, (c) => {
    c.fillStyle = "#7c1230";
    c.fillRect(0, 0, 32, 32);
    c.fillStyle = "rgba(0,0,0,.14)";
    c.fillRect(0, 0, 32, 16);
    disc(c, 16, 8, 1.6, "rgba(255,201,74,.45)");
    disc(c, 16, 24, 1.6, "rgba(255,201,74,.45)");
  });
  make(s, "sign", 340, 64, (c) => {
    rr(c, 6, 6, 328, 52, 10, "rgba(10,3,18,.92)", GOLD_DARK, 2);
    c.font = `36px ${DISPLAY_FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = "#ff4d6d";
    c.shadowBlur = 16;
    c.fillStyle = "#ffe9b0";
    c.fillText("GAMBLE WITH JANNY", 170, 34);
    c.fillText("GAMBLE WITH JANNY", 170, 34);
  });
  make(s, "sconce", 20, 30, (c) => {
    rr(c, 8, 12, 4, 14, 2, GOLD_DARK);
    c.beginPath();
    c.moveTo(3, 14);
    c.lineTo(17, 14);
    c.lineTo(13, 3);
    c.lineTo(7, 3);
    c.closePath();
    c.fillStyle = "#ffe9b0";
    c.fill();
  });
  make(s, "glow", 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,.4)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
}

function machines(s: Phaser.Scene) {
  make(s, "slots", 84, 116, (c) => {
    shadow(c, 42, 110, 38, 6);
    rr(c, 12, 2, 60, 24, 12, vgrad(c, 2, 26, "#ffda76", "#c8892b"), GOLD_DARK);
    c.font = `bold 15px ${DISPLAY_FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#8c1230";
    c.fillText("777", 42, 15);
    rr(
      c,
      8,
      20,
      68,
      86,
      7,
      vgrad(c, 20, 106, "#b5173d", "#5a0a22"),
      "#2c0612",
      1.5,
    );
    rr(c, 14, 30, 56, 34, 4, "#0a0312", GOLD, 2);
    rr(c, 16, 70, 52, 14, 3, "rgba(255,255,255,.08)");
    for (let i = 0; i < 4; i++)
      disc(
        c,
        24 + i * 12,
        77,
        3.5,
        ["#5cff9d", "#ffc94a", "#ff4d6d", "#4dd2ff"][i]!,
      );
    rr(c, 22, 90, 40, 12, 3, "#1a0713", GOLD_DARK);
    rr(c, 76, 44, 4, 26, 2, "#b9b9c8");
    disc(c, 78, 41, 5, "#ff4d6d", "#7c1230");
  });
  make(s, "reelstrip", 24, 72, (c) => {
    c.fillStyle = "#f6efd8";
    c.fillRect(0, 0, 24, 72);
    c.font = "16px serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    [SYMBOLS[0]!, SYMBOLS[3]!, SYMBOLS[2]!].forEach((g, i) =>
      c.fillText(g, 12, 12 + i * 24),
    );
  });

  make(s, "roulette", 176, 92, (c) => {
    shadow(c, 88, 86, 82, 6);
    rr(
      c,
      4,
      6,
      168,
      78,
      14,
      vgrad(c, 6, 84, "#74401f", WOOD_DARK),
      "#1c0c05",
      1.5,
    );
    rr(c, 12, 14, 152, 62, 9, "#0f5c3a", GOLD_DARK);
    c.strokeStyle = "rgba(255,255,255,.4)";
    c.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      c.beginPath();
      c.moveTo(76 + i * 13, 20);
      c.lineTo(76 + i * 13, 58);
      c.stroke();
    }
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(76, 20 + i * 12.6);
      c.lineTo(154, 20 + i * 12.6);
      c.stroke();
    }
    for (let col = 0; col < 6; col++)
      for (let row = 0; row < 3; row++) {
        c.fillStyle =
          (col + row) % 2 ? "rgba(255,60,90,.6)" : "rgba(0,0,0,.55)";
        c.fillRect(77 + col * 13, 21 + row * 12.6, 11, 10.6);
      }
    c.font = "8px sans-serif";
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.fillText("RED  ·  BLACK", 115, 69);
  });
  make(s, "rwheel", 60, 60, (c) => {
    disc(c, 30, 30, 29, WOOD_DARK, GOLD_DARK, 1.5);
    const n = 18;
    for (let i = 0; i < n; i++) {
      c.beginPath();
      c.moveTo(30, 30);
      c.arc(30, 30, 26, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
      c.closePath();
      c.fillStyle = i === 0 ? "#0f8c50" : i % 2 ? "#c8123a" : "#141014";
      c.fill();
    }
    disc(c, 30, 30, 14, vgrad(c, 16, 44, "#74401f", WOOD_DARK), GOLD_DARK);
    disc(c, 30, 30, 4, GOLD);
    c.strokeStyle = GOLD;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(21, 30);
    c.lineTo(39, 30);
    c.moveTo(30, 21);
    c.lineTo(30, 39);
    c.stroke();
  });

  make(s, "dicetable", 166, 92, (c) => {
    shadow(c, 83, 86, 78, 6);
    rr(
      c,
      4,
      6,
      158,
      78,
      30,
      vgrad(c, 6, 84, "#74401f", WOOD_DARK),
      "#1c0c05",
      1.5,
    );
    rr(c, 14, 16, 138, 58, 22, "#123f7a", GOLD_DARK);
    c.strokeStyle = "rgba(255,255,255,.55)";
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect(24, 24, 118, 42, 16);
    c.stroke();
    c.font = `11px ${DISPLAY_FONT}`;
    c.fillStyle = "rgba(255,233,176,.85)";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("OVER · UNDER", 83, 45);
  });
  make(s, "die", 16, 16, (c) => {
    rr(c, 1, 1, 14, 14, 3, "#fff8ec", "#caa");
    for (const [x, y] of [
      [5, 5],
      [8, 8],
      [11, 11],
    ])
      disc(c, x!, y!, 1.4, "#b5173d");
  });

  make(s, "wheelstand", 116, 136, (c) => {
    shadow(c, 58, 130, 46, 6);
    c.fillStyle = vgrad(c, 60, 130, "#4a2412", WOOD_DARK);
    c.beginPath();
    c.moveTo(50, 60);
    c.lineTo(66, 60);
    c.lineTo(82, 128);
    c.lineTo(34, 128);
    c.closePath();
    c.fill();
    rr(c, 26, 120, 64, 10, 3, vgrad(c, 120, 130, GOLD, GOLD_DARK));
  });
  make(s, "bigwheel", 104, 104, (c) => {
    disc(c, 52, 52, 51, vgrad(c, 0, 104, GOLD, GOLD_DARK), "#5a3c0c", 1);
    const n = WHEEL.length;
    WHEEL_ORDER.forEach((idx, pos) => {
      const a = (pos / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n;
      c.beginPath();
      c.moveTo(52, 52);
      c.arc(52, 52, 46, a, a + (Math.PI * 2) / n);
      c.closePath();
      c.fillStyle = wheelColor(WHEEL[idx]!);
      c.fill();
      c.strokeStyle = "rgba(0,0,0,.35)";
      c.lineWidth = 0.6;
      c.stroke();
    });
    disc(c, 52, 52, 11, vgrad(c, 41, 63, GOLD, GOLD_DARK), "#5a3c0c");
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      disc(c, 52 + Math.cos(a) * 48.5, 52 + Math.sin(a) * 48.5, 1.2, "#fff4c8");
    }
  });
  make(s, "pointer", 18, 22, (c) => {
    c.beginPath();
    c.moveTo(1, 1);
    c.lineTo(17, 1);
    c.lineTo(9, 21);
    c.closePath();
    c.fillStyle = "#ff4d6d";
    c.fill();
    c.strokeStyle = "#fff";
    c.lineWidth = 1;
    c.stroke();
  });

  make(s, "crashpad", 120, 84, (c) => {
    shadow(c, 60, 78, 56, 6);
    rr(
      c,
      6,
      36,
      108,
      40,
      6,
      vgrad(c, 36, 76, "#4b5468", "#1d2230"),
      "#0c0f16",
      1.5,
    );
    for (let i = 0; i < 7; i++) {
      c.fillStyle = i % 2 ? "#ffc94a" : "#141014";
      c.fillRect(8 + i * 15.2, 70, 15.2, 5);
    }
    rr(c, 34, 8, 52, 34, 4, "#10151f", "#5cff9d", 1.5);
    c.strokeStyle = "#5cff9d";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(39, 37);
    c.bezierCurveTo(55, 35, 68, 28, 81, 13);
    c.stroke();
    c.font = "7px monospace";
    c.fillStyle = "#5cff9d";
    c.fillText("×2.40", 40, 18);
    rr(c, 14, 48, 16, 8, 2, "#ff4d6d");
    rr(c, 90, 48, 16, 8, 2, "#ffc94a");
  });
  make(s, "rocket", 32, 60, (c) => {
    c.beginPath();
    c.moveTo(16, 1);
    c.bezierCurveTo(27, 14, 26, 36, 23, 46);
    c.lineTo(9, 46);
    c.bezierCurveTo(6, 36, 5, 14, 16, 1);
    c.closePath();
    c.fillStyle = vgrad(c, 1, 46, "#fff", "#b4bccc");
    c.fill();
    c.strokeStyle = "#596178";
    c.lineWidth = 1;
    c.stroke();
    c.beginPath();
    c.moveTo(16, 1);
    c.bezierCurveTo(21, 7, 23, 12, 24, 17);
    c.lineTo(8, 17);
    c.bezierCurveTo(9, 12, 11, 7, 16, 1);
    c.closePath();
    c.fillStyle = "#ff4d6d";
    c.fill();
    disc(c, 16, 26, 5, "#4dd2ff", "#596178", 1.2);
    for (const dir of [-1, 1]) {
      c.beginPath();
      c.moveTo(16 + dir * 7, 34);
      c.lineTo(16 + dir * 15, 52);
      c.lineTo(16 + dir * 7, 47);
      c.closePath();
      c.fillStyle = "#ff4d6d";
      c.fill();
    }
  });
  make(s, "flame", 16, 26, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 26);
    g.addColorStop(0, "#fff6b0");
    g.addColorStop(0.5, "#ffb020");
    g.addColorStop(1, "rgba(255,60,30,0)");
    c.beginPath();
    c.moveTo(2, 0);
    c.lineTo(14, 0);
    c.bezierCurveTo(14, 10, 10, 18, 8, 26);
    c.bezierCurveTo(6, 18, 2, 10, 2, 0);
    c.closePath();
    c.fillStyle = g;
    c.fill();
  });
}

function decor(s: Phaser.Scene) {
  make(s, "poker", 240, 84, (c) => {
    shadow(c, 120, 78, 112, 7);
    rr(
      c,
      4,
      8,
      232,
      66,
      33,
      vgrad(c, 8, 74, "#74401f", WOOD_DARK),
      "#1c0c05",
      1.5,
    );
    rr(c, 14, 16, 212, 50, 25, "#0f5c3a", GOLD_DARK);
    c.strokeStyle = "rgba(255,255,255,.2)";
    c.beginPath();
    c.roundRect(28, 24, 184, 34, 17);
    c.stroke();
    for (let i = 0; i < 5; i++) {
      rr(c, 88 + i * 13, 34, 11, 15, 1.5, "#fff", "#888", 0.5);
      c.fillStyle = i % 2 ? "#c8123a" : "#141014";
      c.font = "8px serif";
      c.textAlign = "center";
      c.fillText(i % 2 ? "♥" : "♠", 93.5 + i * 13, 45);
    }
  });
  make(s, "chips", 18, 18, (c) => {
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.ellipse(9, 14 - i * 3, 8, 3.4, 0, 0, Math.PI * 2);
      c.fillStyle = ["#c8123a", "#ffc94a", "#1d6fd8", "#141014"][i]!;
      c.fill();
      c.strokeStyle = "rgba(255,255,255,.6)";
      c.lineWidth = 0.6;
      c.stroke();
    }
  });
  make(s, "stool", 22, 28, (c) => {
    shadow(c, 11, 25, 8, 2.5);
    rr(c, 9, 10, 4, 14, 1, "#a8791c");
    c.beginPath();
    c.ellipse(11, 9, 9, 5, 0, 0, Math.PI * 2);
    c.fillStyle = "#8c1230";
    c.fill();
    c.strokeStyle = "#4a0a1c";
    c.stroke();
  });
  make(s, "plant", 44, 66, (c) => {
    shadow(c, 22, 62, 15, 4);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.36;
      c.beginPath();
      c.moveTo(22, 42);
      c.quadraticCurveTo(
        22 + Math.cos(a) * 14,
        42 + Math.sin(a) * 30,
        22 + Math.cos(a) * 22,
        42 + Math.sin(a) * (26 + ((i * 7) % 10)),
      );
      c.quadraticCurveTo(22 + Math.cos(a) * 8, 42 + Math.sin(a) * 14, 22, 42);
      c.fillStyle = i % 2 ? "#1e8a57" : "#14693f";
      c.fill();
    }
    c.beginPath();
    c.moveTo(11, 42);
    c.lineTo(33, 42);
    c.lineTo(29, 62);
    c.lineTo(15, 62);
    c.closePath();
    c.fillStyle = vgrad(c, 42, 62, GOLD, GOLD_DARK);
    c.fill();
  });
  make(s, "pillar", 44, 130, (c) => {
    shadow(c, 22, 124, 20, 5);
    rr(c, 4, 108, 36, 18, 2, vgrad(c, 108, 126, GOLD, GOLD_DARK));
    const g = c.createLinearGradient(8, 0, 36, 0);
    g.addColorStop(0, "#2a1140");
    g.addColorStop(0.45, "#6b3a96");
    g.addColorStop(1, "#1b0a2b");
    c.fillStyle = g;
    c.fillRect(8, 10, 28, 100);
    rr(c, 3, 2, 38, 12, 2, vgrad(c, 2, 14, GOLD, GOLD_DARK));
    c.strokeStyle = "rgba(255,255,255,.08)";
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(13 + i * 6, 14);
      c.lineTo(13 + i * 6, 108);
      c.stroke();
    }
  });
  make(s, "post", 12, 38, (c) => {
    shadow(c, 6, 35, 5, 2);
    rr(c, 4.5, 6, 3, 28, 1, vgrad(c, 6, 34, GOLD, GOLD_DARK));
    disc(c, 6, 5, 4, GOLD, GOLD_DARK);
    rr(c, 1, 31, 10, 4, 2, GOLD_DARK);
  });
  make(s, "bar", 260, 108, (c) => {
    shadow(c, 130, 102, 126, 6);
    rr(c, 4, 4, 252, 52, 4, vgrad(c, 4, 56, "#2c1045", "#170723"), GOLD_DARK);
    c.fillStyle = GOLD_DARK;
    c.fillRect(8, 30, 244, 2);
    const cols = ["#4dd2ff", "#ff4d6d", "#5cff9d", "#ffc94a", "#b07cff"];
    for (let i = 0; i < 22; i++) {
      const x = 12 + i * 11;
      c.fillStyle = cols[i % 5]!;
      rr(c, x, 14 + (i % 3), 6, 16 - (i % 3), 1.5, cols[i % 5]!);
      rr(c, x + 2, 10 + (i % 3), 2, 5, 0.5, cols[i % 5]!);
    }
    for (let i = 0; i < 14; i++)
      rr(c, 14 + i * 17, 38, 8, 12, 1, "rgba(255,255,255,.3)");
    rr(c, 2, 56, 256, 8, 2, vgrad(c, 56, 64, "#a8682e", WOOD));
    c.fillStyle = vgrad(c, 64, 102, WOOD, WOOD_DARK);
    c.fillRect(6, 64, 248, 38);
    for (let i = 0; i < 6; i++) {
      c.strokeStyle = "rgba(0,0,0,.35)";
      c.strokeRect(12 + i * 41, 70, 35, 26);
    }
  });
  make(s, "cage", 240, 118, (c) => {
    shadow(c, 120, 112, 116, 6);
    rr(c, 4, 4, 232, 26, 4, vgrad(c, 4, 30, GOLD, GOLD_DARK), "#5a3c0c");
    c.font = `17px ${DISPLAY_FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#3b0f2a";
    c.fillText("CASHIER", 120, 18);
    c.fillStyle = "#160820";
    c.fillRect(10, 30, 220, 44);
    c.strokeStyle = GOLD_DARK;
    c.lineWidth = 2;
    for (let i = 0; i <= 20; i++) {
      c.beginPath();
      c.moveTo(10 + i * 11, 30);
      c.lineTo(10 + i * 11, 74);
      c.stroke();
    }
    rr(c, 6, 74, 228, 8, 2, vgrad(c, 74, 82, "#a8682e", WOOD));
    c.fillStyle = vgrad(c, 82, 112, WOOD, WOOD_DARK);
    c.fillRect(10, 82, 220, 30);
  });
  make(s, "chandelier", 86, 62, (c) => {
    c.strokeStyle = GOLD;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(43, 0);
    c.lineTo(43, 20);
    c.stroke();
    c.beginPath();
    c.ellipse(43, 26, 36, 10, 0, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2,
        x = 43 + Math.cos(a) * 36,
        y = 26 + Math.sin(a) * 10;
      c.beginPath();
      c.moveTo(43, 20);
      c.lineTo(x, y);
      c.lineWidth = 1;
      c.stroke();
      disc(c, x, y + 6, 3.6, "#fff6c8", "rgba(255,201,74,.8)");
    }
    disc(c, 43, 34, 5, "#fff6c8", GOLD);
  });
  make(s, "coin", 14, 14, (c) => {
    disc(c, 7, 7, 6.2, vgrad(c, 0, 14, "#ffe9a0", "#d39a22"), "#8a6212");
    c.font = "bold 8px serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#8a6212";
    c.fillText("$", 7, 7.5);
  });
  make(s, "puff", 16, 16, (c) => {
    const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, "rgba(190,190,210,.8)");
    g.addColorStop(1, "rgba(190,190,210,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 16);
  });
}

function originalMachines(scene: Phaser.Scene) {
  make(scene, "cupstable", 130, 76, (c) => {
    shadow(c, 65, 70, 60, 6);
    rr(c, 18, 44, 94, 28, 4, vgrad(c, 44, 72, WOOD, WOOD_DARK), GOLD_DARK);
    rr(c, 6, 30, 118, 22, 8, vgrad(c, 30, 52, "#127a4a", "#0a4a2d"), GOLD_DARK, 2);
    for (const x of [35, 65, 95]) {
      c.beginPath();
      c.moveTo(x - 12, 44);
      c.lineTo(x - 8, 14);
      c.quadraticCurveTo(x, 9, x + 8, 14);
      c.lineTo(x + 12, 44);
      c.closePath();
      c.fillStyle = vgrad(c, 10, 44, "#e8574a", "#8f1d27");
      c.fill();
      c.strokeStyle = "#4a0d14";
      c.lineWidth = 1;
      c.stroke();
    }
  });
  make(scene, "vaultdoor", 110, 124, (c) => {
    shadow(c, 55, 118, 50, 6);
    rr(c, 6, 4, 98, 114, 8, vgrad(c, 4, 118, "#8b9ab5", "#3a455c"), "#1c2333", 2);
    rr(c, 14, 12, 82, 98, 6, vgrad(c, 12, 110, "#6d7c98", "#47536c"), "#1c2333");
    disc(c, 55, 60, 28, "#2a3245", GOLD_DARK, 3);
    disc(c, 55, 60, 7, GOLD, GOLD_DARK);
    c.strokeStyle = GOLD;
    c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      c.moveTo(55 - Math.cos(a) * 22, 60 - Math.sin(a) * 22);
      c.lineTo(55 + Math.cos(a) * 22, 60 + Math.sin(a) * 22);
    }
    c.stroke();
    for (const y of [24, 96]) for (const x of [22, 88]) disc(c, x, y, 3, "#c7d1e3", "#1c2333");
  });
  make(scene, "m-shop", 130, 112, (c) => {
    shadow(c, 65, 106, 60, 5);
    rr(c, 8, 26, 114, 80, 4, vgrad(c, 26, 106, "#1c1030", "#0a0414"), "#5b3fa8", 2);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? "#2a1a4a" : "#4a2f86";
      c.fillRect(4 + i * 20.4, 8, 20.4, 22);
    }
    c.font = "30px serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#fff";
    c.fillText("🕵️", 65, 60);
    rr(c, 8, 86, 114, 20, 3, vgrad(c, 86, 106, WOOD, WOOD_DARK), "#5b3fa8");
    c.font = "13px serif";
    c.fillText("🧪 🃏 💣", 65, 96);
  });
  for (const [id, g] of Object.entries(SIMPLE)) {
    const hex = `#${g.color.toString(16).padStart(6, "0")}`;
    const emoji = (c: C, size: number, x: number, y: number) => {
      c.font = `${size}px serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#fff";
      c.fillText(g.icon, x, y);
    };
    if (g.style === "cabinet")
      make(scene, `m-${id}`, 84, 118, (c) => {
        shadow(c, 42, 112, 38, 5);
        rr(c, 6, 4, 72, 108, 8, vgrad(c, 4, 112, hex, "#2a1630"), GOLD_DARK, 2);
        rr(c, 13, 12, 58, 52, 5, "#120620", GOLD);
        emoji(c, 32, 42, 39);
        rr(c, 16, 74, 52, 8, 3, "#120620", GOLD_DARK);
        for (const x of [24, 42, 60]) disc(c, x, 94, 4, GOLD, GOLD_DARK);
      });
    else if (g.style === "table")
      make(scene, `m-${id}`, 170, 78, (c) => {
        shadow(c, 85, 72, 78, 6);
        rr(c, 24, 46, 122, 26, 4, vgrad(c, 46, 72, WOOD, WOOD_DARK), GOLD_DARK);
        rr(c, 6, 14, 158, 42, 14, vgrad(c, 14, 56, hex, "#1b1026"), GOLD_DARK, 2);
        rr(c, 18, 21, 134, 28, 10, "rgba(10,3,18,.55)");
        emoji(c, 24, 85, 36);
      });
    else
      make(scene, `m-${id}`, 130, 112, (c) => {
        shadow(c, 65, 106, 60, 5);
        rr(c, 8, 26, 114, 80, 4, vgrad(c, 26, 106, "#2a1630", "#120620"), GOLD_DARK, 2);
        for (let i = 0; i < 6; i++) {
          c.fillStyle = i % 2 ? "#f6ecd8" : hex;
          c.fillRect(4 + i * 20.4, 8, 20.4, 22);
        }
        c.strokeStyle = GOLD_DARK;
        c.strokeRect(4, 8, 122, 22);
        emoji(c, 34, 65, 64);
        rr(c, 8, 90, 114, 16, 3, vgrad(c, 90, 106, WOOD, WOOD_DARK), GOLD_DARK);
      });
  }
}

export function buildArt(scene: Phaser.Scene) {
  room(scene);
  machines(scene);
  originalMachines(scene);
  decor(scene);
}

export interface Look {
  suit: string;
  suitDark: string;
  hair: string;
  skin: string;
  tie: string;
}
const HAIRS = [
    "#1d1320",
    "#3b2314",
    "#7a4a20",
    "#c99a4a",
    "#8c8c98",
    "#a33a2a",
  ],
  SKINS = ["#ffdcb8", "#f0c090", "#c98f5e", "#8e5a36"];
export const lookFor = (hue: number): Look => ({
  suit: `hsl(${hue} 62% 44%)`,
  suitDark: `hsl(${hue} 62% 28%)`,
  hair: HAIRS[hue % HAIRS.length]!,
  skin: SKINS[hue % SKINS.length]!,
  tie: `hsl(${(hue + 150) % 360} 80% 62%)`,
});
export const CHAR_W = 28,
  CHAR_H = 40;
type Dir = "d" | "u" | "s";

function drawChar(c: C, dir: Dir, step: number, l: Look) {
  shadow(c, 14, 37, 9, 3);
  const swing = step === 0 ? 0 : step === 1 ? 2 : -2;
  // Legs and shoes
  const leg = (x: number, lift: number) => {
    rr(c, x, 26, 5, 10 - lift, 1.5, "#16101d");
    rr(
      c,
      x - (dir === "s" ? 0 : 0.5),
      34 - lift,
      dir === "s" ? 7 : 6,
      3,
      1.5,
      "#07040a",
    );
  };
  if (dir === "s") {
    leg(10 + swing, 0);
    leg(13 - swing, step ? 1 : 0);
  } else {
    leg(8, swing > 0 ? 2 : 0);
    leg(15, swing < 0 ? 2 : 0);
  }
  // Arms sit behind the torso when viewed from the side
  const arm = (x: number, dy: number) => {
    rr(c, x, 16 + dy, 4, 11, 2, l.suitDark);
    disc(c, x + 2, 28 + dy, 2, l.skin);
  };
  if (dir === "s") arm(12 - swing, 0);
  else {
    arm(4, swing);
    arm(20, -swing);
  }
  // Torso
  const tx = dir === "s" ? 8 : 7,
    tw = dir === "s" ? 12 : 14;
  rr(c, tx, 15, tw, 13, 3.5, vgrad(c, 15, 28, l.suit, l.suitDark));
  if (dir === "d") {
    c.beginPath();
    c.moveTo(11, 15);
    c.lineTo(17, 15);
    c.lineTo(14, 22);
    c.closePath();
    c.fillStyle = "#fff";
    c.fill();
    c.beginPath();
    c.moveTo(13, 16);
    c.lineTo(15, 16);
    c.lineTo(15.4, 21);
    c.lineTo(14, 23);
    c.lineTo(12.6, 21);
    c.closePath();
    c.fillStyle = l.tie;
    c.fill();
  }
  if (dir === "s") arm(13 + swing, 0);
  // Head and hair
  disc(c, 14, 9, 8, l.skin);
  c.fillStyle = l.hair;
  if (dir === "u") {
    disc(c, 14, 9, 8.2, l.hair);
  } else if (dir === "d") {
    c.beginPath();
    c.arc(14, 8, 8.2, Math.PI, 0);
    c.lineTo(20, 8);
    c.quadraticCurveTo(14, 5, 8, 8);
    c.closePath();
    c.fill();
    disc(c, 11, 10, 1.2, "#1d1320");
    disc(c, 17, 10, 1.2, "#1d1320");
    c.strokeStyle = "rgba(0,0,0,.45)";
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(14, 12, 2, 0.3, Math.PI - 0.3);
    c.stroke();
  } else {
    c.beginPath();
    c.arc(13, 8, 8.2, Math.PI * 0.8, Math.PI * 1.95);
    c.quadraticCurveTo(14, 7, 9, 12);
    c.closePath();
    c.fill();
    disc(c, 18, 10, 1.2, "#1d1320");
  }
}

/** Creates a character sheet with frames d0-2, u0-2 and s0-2. Side frames face right; flip them to face left. */
export function makeCharacter(scene: Phaser.Scene, key: string, look: Look) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, CHAR_W * 3 * S, CHAR_H * 3 * S)!,
    c = t.context;
  c.scale(S, S);
  (["d", "u", "s"] as Dir[]).forEach((dir, row) => {
    for (let step = 0; step < 3; step++) {
      c.save();
      c.translate(step * CHAR_W, row * CHAR_H);
      drawChar(c, dir, step, look);
      c.restore();
      t.add(
        `${dir}${step}`,
        0,
        step * CHAR_W * S,
        row * CHAR_H * S,
        CHAR_W * S,
        CHAR_H * S,
      );
    }
  });
  t.refresh();
}
