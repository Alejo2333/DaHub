import { twoBone, type V } from "./ik";

/** Body proportions for a runner about 80 tall. */
export const BONES = {
  thigh: 22,
  shin: 21,
  foot: 9,
  torso: 25,
  neck: 4,
  head: 6.5,
  upperArm: 14,
  forearm: 14,
};

/**
 * A pose, as positions for hands and feet. IK fills in the elbows and knees, so limbs never stretch.
 * Everything is relative to the runner's feet position, with y growing downward.
 */
export interface Pose {
  /** Pelvis. */
  px: number;
  py: number;
  /** Torso angle in degrees. 0 is upright, and positive leans forward. */
  lean: number;
  /** Head angle relative to upright. */
  head: number;
  /** Ankles, with the toe's pitch in degrees (0 is flat, positive points down). */
  fx: number;
  fy: number;
  fp: number;
  bx: number;
  by: number;
  bp: number;
  /** Hands, relative to the shoulder. */
  hfx: number;
  hfy: number;
  hbx: number;
  hby: number;
  /** How much the hands grip the anchor in the world, from 0 to 1. */
  grip: number;
  /** How much the feet stay fixed in the world, from 0 to 1. */
  plant: number;
}
export type PoseKey = keyof Pose;

export interface Joints {
  pelvis: V;
  chest: V;
  shoulder: V;
  neck: V;
  head: V;
  kneeF: V;
  ankleF: V;
  toeF: V;
  kneeB: V;
  ankleB: V;
  toeB: V;
  elbowF: V;
  handF: V;
  elbowB: V;
  handB: V;
}
const RAD = Math.PI / 180;

/** Turns a pose into world positions for every joint. */
export function solve(
  pose: Pose,
  x: number,
  y: number,
  anchor: V | null,
  feet?: { f: V | null; b: V | null },
): Joints {
  const pelvis = { x: x + pose.px, y: y + pose.py },
    a = pose.lean * RAD,
    up = { x: Math.sin(a), y: -Math.cos(a) },
    chest = {
      x: pelvis.x + up.x * BONES.torso,
      y: pelvis.y + up.y * BONES.torso,
    },
    shoulder = { x: chest.x - up.x * 2, y: chest.y - up.y * 2 },
    h = (pose.lean + pose.head) * RAD,
    neck = {
      x: chest.x + Math.sin(a) * BONES.neck,
      y: chest.y - Math.cos(a) * BONES.neck,
    },
    head = {
      x: neck.x + Math.sin(h) * BONES.head,
      y: neck.y - Math.cos(h) * BONES.head,
    };
  const leg = (fx: number, fy: number, pitch: number, lock: V | null) => {
    const target = lock ?? { x: x + fx, y: y + fy };
    const { joint, end } = twoBone(
      pelvis,
      target,
      BONES.thigh,
      BONES.shin,
      -1,
    );
    const t = pitch * RAD;
    return {
      knee: joint,
      ankle: end,
      toe: {
        x: end.x + Math.cos(t) * BONES.foot,
        y: end.y + Math.sin(t) * BONES.foot,
      },
    };
  };
  const arm = (hx: number, hy: number, offset: number) => {
    let tx = shoulder.x + hx,
      ty = shoulder.y + hy;
    if (anchor && pose.grip > 0) {
      tx += (anchor.x + offset - tx) * pose.grip;
      ty += (anchor.y - ty) * pose.grip;
    }
    const { joint, end } = twoBone(
      shoulder,
      { x: tx, y: ty },
      BONES.upperArm,
      BONES.forearm,
      1,
    );
    return { elbow: joint, hand: end };
  };
  const F = leg(pose.fx, pose.fy, pose.fp, feet?.f ?? null),
    B = leg(pose.bx, pose.by, pose.bp, feet?.b ?? null),
    AF = arm(pose.hfx, pose.hfy, 3),
    AB = arm(pose.hbx, pose.hby, -3);
  return {
    pelvis,
    chest,
    shoulder,
    neck,
    head,
    kneeF: F.knee,
    ankleF: F.ankle,
    toeF: F.toe,
    kneeB: B.knee,
    ankleB: B.ankle,
    toeB: B.toe,
    elbowF: AF.elbow,
    handF: AF.hand,
    elbowB: AB.elbow,
    handB: AB.hand,
  };
}
