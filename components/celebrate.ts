"use client";

import confetti from "canvas-confetti";

const COLORS = ["#2383e2", "#9065b0", "#d9730d", "#448361", "#cb912f", "#c14c8a"];

export function celebrate(big = true) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  confetti({ particleCount: big ? 140 : 70, spread: 80, startVelocity: 42, origin: { y: 0.65 }, colors: COLORS, zIndex: 60 });
  if (!big) return;
  setTimeout(() => {
    confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors: COLORS, zIndex: 60 });
    confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors: COLORS, zIndex: 60 });
  }, 180);
}
