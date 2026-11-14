//! The room program. One draw, then one judgment of three held moments.

use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

#[derive(Deserialize)]
struct Input {
    action: String,
    /// 1 measures the dots. 2 scores them with the pose model, once per hold.
    #[serde(default = "default_version")]
    version: u8,
    #[serde(default)]
    seed: u64,
    #[serde(default)]
    poses: Vec<u8>,
    #[serde(default)]
    moments: Vec<Moment>,
}

#[derive(Deserialize)]
struct Moment {
    pose: u8,
    held_ms: u32,
    points: Vec<[f32; 2]>,
}

#[derive(Serialize)]
struct DrawOut {
    poses: [u8; 3],
}

#[derive(Serialize)]
struct JudgeOut {
    pass: bool,
    version: u8,
}

fn default_version() -> u8 {
    1
}

fn main() {
    let mut raw = String::new();
    io::stdin().read_to_string(&mut raw).expect("input");
    let input: Input = serde_json::from_str(&raw).expect("json");
    let output = match input.action.as_str() {
        "draw" => serde_json::to_string(&DrawOut {
            poses: draw_three(input.seed),
        })
        .unwrap(),
        "judge" => serde_json::to_string(&JudgeOut {
            pass: judge(input.version, &input.poses, &input.moments),
            version: input.version,
        })
        .unwrap(),
        _ => serde_json::json!({ "pass": false }).to_string(),
    };
    print!("{output}");
    io::stdout().flush().ok();
}

fn draw_three(seed: u64) -> [u8; 3] {
    let mut state = seed | 1;
    let mut next = || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        (state % 6) as u8
    };
    let mut poses = [0u8; 3];
    let mut used = [false; 6];
    for pose in &mut poses {
        loop {
            let pick = next();
            if !used[pick as usize] {
                used[pick as usize] = true;
                *pose = pick;
                break;
            }
        }
    }
    poses
}

pub fn judge(version: u8, poses: &[u8], moments: &[Moment]) -> bool {
    if poses.len() != 3 || moments.len() != 3 {
        return false;
    }
    moments.iter().zip(poses).all(|(moment, required)| {
        moment.pose == *required
            && moment.held_ms >= 750
            && moment.points.len() == 21
            && match version {
                2 => pose_matches_model(*required, &moment.points),
                _ => pose_matches(*required, &moment.points),
            }
    })
}

fn pose_matches(pose: u8, points: &[[f32; 2]]) -> bool {
    let spread = mean_tip_spread(points);
    match pose {
        0 => spread > 0.34,
        1 => spread < 0.22,
        2 => finger_extended(points, 8, 5) && fingers_curled(points, &[12, 16, 20], &[9, 13, 17]),
        3 => points[4][1] + 0.08 < points[0][1] && fingers_curled(points, &[8, 12, 16, 20], &[5, 9, 13, 17]),
        4 => points[4][1] > points[0][1] + 0.08 && fingers_curled(points, &[8, 12, 16, 20], &[5, 9, 13, 17]),
        5 => finger_extended(points, 8, 5)
            && finger_extended(points, 12, 9)
            && fingers_curled(points, &[16, 20], &[13, 17]),
        _ => false,
    }
}

/// Second version. Same three moments, scored once each by the pose model.
/// The model file is added beside this program when it is packed. Until that
/// file is present, this version refuses rather than pretending.
fn pose_matches_model(pose: u8, points: &[[f32; 2]]) -> bool {
    let Some(scores) = model::score(points) else {
        return false;
    };
    let best = scores
        .iter()
        .enumerate()
        .max_by(|left, right| left.1.partial_cmp(right.1).unwrap())
        .map(|(index, _)| index as u8);
    best == Some(pose) && scores.get(pose as usize).copied().unwrap_or(0.0) >= 0.75
}

mod model {
    /// Returns eight pose scores, or nothing when the model weights are not packed.
    pub fn score(points: &[[f32; 2]]) -> Option<[f32; 8]> {
        let _ = points;
        None
    }
}

fn mean_tip_spread(points: &[[f32; 2]]) -> f32 {
    let wrist = points[0];
    [4, 8, 12, 16, 20]
        .into_iter()
        .map(|index| dist(points[index], wrist))
        .sum::<f32>()
        / 5.0
}

fn finger_extended(points: &[[f32; 2]], tip: usize, mcp: usize) -> bool {
    dist(points[tip], points[0]) > dist(points[mcp], points[0]) + 0.12
}

fn fingers_curled(points: &[[f32; 2]], tips: &[usize], mcps: &[usize]) -> bool {
    tips.iter().zip(mcps).all(|(tip, mcp)| dist(points[*tip], points[*mcp]) < 0.14)
}

fn dist(a: [f32; 2], b: [f32; 2]) -> f32 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    dx.mul_add(dx, dy * dy).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hand(tips: [[f32; 2]; 5]) -> Vec<[f32; 2]> {
        let mut points = vec![[0.5, 0.6]; 21];
        points[0] = [0.5, 0.7];
        for (tip, point) in [4, 8, 12, 16, 20].into_iter().zip(tips) {
            points[tip] = point;
        }
        points[5] = [0.42, 0.55];
        points[9] = [0.48, 0.52];
        points[13] = [0.54, 0.54];
        points[17] = [0.60, 0.58];
        points
    }

    fn moment(pose: u8, points: Vec<[f32; 2]>) -> Moment {
        Moment { pose, held_ms: 800, points }
    }

    #[test]
    fn open_palm_passes_and_a_fist_does_not_count_as_one() {
        let open = hand([[0.2, 0.2], [0.3, 0.15], [0.45, 0.1], [0.6, 0.15], [0.75, 0.25]]);
        assert!(pose_matches(0, &open));
        assert!(!pose_matches(1, &open));
    }

    #[test]
    fn fist_is_closed() {
        let fist = hand([[0.48, 0.62], [0.5, 0.6], [0.52, 0.61], [0.54, 0.62], [0.56, 0.63]]);
        assert!(pose_matches(1, &fist));
        assert!(!pose_matches(0, &fist));
    }

    #[test]
    fn three_matching_holds_pass() {
        let open = hand([[0.2, 0.2], [0.3, 0.15], [0.45, 0.1], [0.6, 0.15], [0.75, 0.25]]);
        let fist = hand([[0.48, 0.62], [0.5, 0.6], [0.52, 0.61], [0.54, 0.62], [0.56, 0.63]]);
        let poses = [0, 1, 0];
        let moments = vec![moment(0, open.clone()), moment(1, fist), moment(0, open)];
        assert!(judge(1, &poses, &moments));
    }

    #[test]
    fn a_reported_pose_that_disagrees_with_the_dots_fails() {
        let fist = hand([[0.48, 0.62], [0.5, 0.6], [0.52, 0.61], [0.54, 0.62], [0.56, 0.63]]);
        let moments = vec![moment(0, fist.clone()), moment(0, fist.clone()), moment(0, fist)];
        assert!(!judge(1, &[0, 0, 0], &moments));
    }

    #[test]
    fn a_short_hold_fails() {
        let open = hand([[0.2, 0.2], [0.3, 0.15], [0.45, 0.1], [0.6, 0.15], [0.75, 0.25]]);
        let mut first = moment(0, open.clone());
        first.held_ms = 100;
        let moments = vec![first, moment(0, open.clone()), moment(0, open)];
        assert!(!judge(1, &[0, 0, 0], &moments));
    }

    #[test]
    fn the_model_judge_refuses_until_its_weights_are_packed() {
        let open = hand([[0.2, 0.2], [0.3, 0.15], [0.45, 0.1], [0.6, 0.15], [0.75, 0.25]]);
        let moments = vec![moment(0, open.clone()), moment(0, open.clone()), moment(0, open)];
        assert!(!judge(2, &[0, 0, 0], &moments));
    }
}
