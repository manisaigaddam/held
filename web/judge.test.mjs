import { judge, poseMatches } from "./judge.js";

function hand(tips) {
  const points = Array.from({ length: 21 }, () => [0.5, 0.6]);
  points[0] = [0.5, 0.7];
  [4, 8, 12, 16, 20].forEach((tip, index) => {
    points[tip] = tips[index];
  });
  points[5] = [0.42, 0.55];
  points[9] = [0.48, 0.52];
  points[13] = [0.54, 0.54];
  points[17] = [0.6, 0.58];
  return points;
}

const open = hand([[0.2, 0.2], [0.3, 0.15], [0.45, 0.1], [0.6, 0.15], [0.75, 0.25]]);
const fist = hand([[0.48, 0.62], [0.5, 0.6], [0.52, 0.61], [0.54, 0.62], [0.56, 0.63]]);

if (!poseMatches(0, open) || poseMatches(1, open)) throw new Error("open palm");
if (!poseMatches(1, fist) || poseMatches(0, fist)) throw new Error("fist");

const moments = [
  { pose: 0, held_ms: 800, points: open },
  { pose: 1, held_ms: 800, points: fist },
  { pose: 0, held_ms: 800, points: open },
];
if (!judge([0, 1, 0], moments)) throw new Error("sequence should pass");

const lied = moments.map((moment) => ({ ...moment, points: fist }));
if (judge([0, 1, 0], lied)) throw new Error("a fist must not pass as an open palm");

const short = [{ ...moments[0], held_ms: 100 }, moments[1], moments[2]];
if (judge([0, 1, 0], short)) throw new Error("a short hold must fail");

console.log("judge checks passed");
