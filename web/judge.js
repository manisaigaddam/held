export function dist(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.hypot(dx, dy);
}

function meanTipSpread(points) {
  const wrist = points[0];
  return [4, 8, 12, 16, 20].reduce((sum, index) => sum + dist(points[index], wrist), 0) / 5;
}

function fingerExtended(points, tip, mcp) {
  return dist(points[tip], points[0]) > dist(points[mcp], points[0]) + 0.12;
}

function fingersCurled(points, tips, mcps) {
  return tips.every((tip, index) => dist(points[tip], points[mcps[index]]) < 0.14);
}

export function poseMatches(pose, points) {
  if (!points || points.length !== 21) return false;
  const spread = meanTipSpread(points);
  if (pose === 0) return spread > 0.34;
  if (pose === 1) return spread < 0.22;
  if (pose === 2) return fingerExtended(points, 8, 5) && fingersCurled(points, [12, 16, 20], [9, 13, 17]);
  if (pose === 3) return points[4][1] + 0.08 < points[0][1] && fingersCurled(points, [8, 12, 16, 20], [5, 9, 13, 17]);
  if (pose === 4) return points[4][1] > points[0][1] + 0.08 && fingersCurled(points, [8, 12, 16, 20], [5, 9, 13, 17]);
  if (pose === 5) {
    return fingerExtended(points, 8, 5) && fingerExtended(points, 12, 9) && fingersCurled(points, [16, 20], [13, 17]);
  }
  return false;
}

export function judge(poses, moments) {
  if (!poses || !moments || poses.length !== 3 || moments.length !== 3) return false;
  return moments.every((moment, index) => {
    return moment.pose === poses[index]
      && moment.held_ms >= 750
      && poseMatches(poses[index], moment.points);
  });
}

export const poseNames = ["Open palm", "Closed fist", "Point up", "Thumbs up", "Thumbs down", "Victory"];
