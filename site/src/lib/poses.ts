function dist(a: number[], b: number[]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function spread(points: number[][]) {
  const wrist = points[0];
  return [4, 8, 12, 16, 20].reduce((sum, index) => sum + dist(points[index], wrist), 0) / 5;
}

function extended(points: number[][], tip: number, mcp: number) {
  return dist(points[tip], points[0]) > dist(points[mcp], points[0]) + 0.12;
}

function curled(points: number[][], tips: number[], mcps: number[]) {
  return tips.every((tip, index) => dist(points[tip], points[mcps[index]]) < 0.14);
}

export function poseMatches(pose: number, points: number[][]) {
  if (points.length !== 21) return false;
  if (pose === 0) return spread(points) > 0.34;
  if (pose === 1) return spread(points) < 0.22;
  if (pose === 2) return extended(points, 8, 5) && curled(points, [12, 16, 20], [9, 13, 17]);
  if (pose === 3) return points[4][1] + 0.08 < points[0][1] && curled(points, [8, 12, 16, 20], [5, 9, 13, 17]);
  if (pose === 4) return points[4][1] > points[0][1] + 0.08 && curled(points, [8, 12, 16, 20], [5, 9, 13, 17]);
  if (pose === 5) return extended(points, 8, 5) && extended(points, 12, 9) && curled(points, [16, 20], [13, 17]);
  return false;
}
