import { judge, poseNames } from "./judge.js";

const FRESH_MS = 60_000;
const HOLD_MS = 750;
const POSE_IDS = {
  Open_Palm: 0,
  Closed_Fist: 1,
  Pointing_Up: 2,
  Thumb_Up: 3,
  Thumb_Down: 4,
  Victory: 5,
};

const freshnessText = document.querySelector("#freshness");
const primary = document.querySelector("#primary");
const stage = document.querySelector("#stage");
const ask = document.querySelector("#ask");
const holdText = document.querySelector("#hold");
const video = document.querySelector("#camera");
const result = document.querySelector("#result");
const resultText = document.querySelector("#result-text");

let sequence = [0, 1, 5];
let step = 0;
let moments = [];
let holdStarted = null;
let lastMatch = 0;
let lastPoints = null;
let detector = null;
let stream = null;
let frame = 0;
let done = false;

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem("held-session") || "null");
  } catch {
    return null;
  }
}

function saveSession(session) {
  sessionStorage.setItem("held-session", JSON.stringify(session));
}

function readFreshness() {
  const session = loadSession();
  if (!session) return { fresh: false, used: false, remaining: 0 };
  const age = Date.now() - session.at;
  const fresh = age >= 0 && age <= FRESH_MS;
  return { fresh, used: Boolean(session.used) && fresh, remaining: Math.max(0, FRESH_MS - age) };
}

function render() {
  const state = readFreshness();
  stage.hidden = true;
  result.hidden = true;
  primary.disabled = false;
  if (state.fresh && !state.used) {
    freshnessText.textContent = "This browser session is fresh. You can mint here without holding again. The chain is checked separately below.";
    primary.textContent = "Mint";
    primary.onclick = mint;
  } else if (state.fresh && state.used) {
    freshnessText.textContent = `This browser pass was used. Hold again in ${Math.ceil(state.remaining / 1000)}s.`;
    primary.textContent = "Hold to mint";
    primary.disabled = true;
  } else {
    freshnessText.textContent = "No fresh pass in this browser. Hold the three poses, then mint.";
    primary.textContent = "Hold to mint";
    primary.onclick = startHold;
  }
  readChain();
}

async function readChain() {
  const args = btoa(JSON.stringify({ account: "held141126.testnet", max_age_ms: 60000 }));
  try {
    const response = await fetch("https://rpc.testnet.near.org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "held",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: "held141126.testnet",
          method_name: "is_fresh",
          args_base64: args,
        },
      }),
    });
    const body = await response.json();
    const bytes = body.result?.result;
    const fresh = bytes ? JSON.parse(String.fromCharCode(...bytes)) : false;
    const line = document.querySelector("#chain");
    if (line) line.textContent = fresh
      ? "On testnet, held141126.testnet is fresh."
      : "On testnet, held141126.testnet is not fresh.";
  } catch {
    const line = document.querySelector("#chain");
    if (line) line.textContent = "The testnet registry did not answer.";
  }
}

function mint() {
  const state = readFreshness();
  if (!state.fresh || state.used) {
    render();
    return;
  }
  const session = loadSession();
  session.used = true;
  saveSession(session);
  result.hidden = false;
  resultText.textContent = "Minted 1 coin for this pass.";
  render();
  result.hidden = false;
}

async function startHold() {
  sequence = [0, 1, 5];
  step = 0;
  moments = [];
  done = false;
  holdStarted = null;
  lastPoints = null;
  primary.disabled = true;
  stage.hidden = false;
  result.hidden = true;
  showPose();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  } catch (error) {
    stage.hidden = true;
    result.hidden = false;
    resultText.textContent = "The camera did not open. Allow it in the browser and try again.";
    primary.disabled = false;
    return;
  }
  video.srcObject = stream;
  await video.play();
  const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/+esm");
  const files = await vision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm",
  );
  detector = await vision.GestureRecognizer.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
    cannedGesturesClassifierOptions: { scoreThreshold: 0.75 },
  });
  const tick = () => {
    if (!done && video.readyState >= 2) look();
    if (!done) frame = requestAnimationFrame(tick);
  };
  tick();
}

function showPose() {
  ask.textContent = `Pose ${step + 1} of 3: ${poseNames[sequence[step]]}`;
  holdText.textContent = "Show it and hold still.";
}

function look() {
  const now = performance.now();
  const seen = detector.recognizeForVideo(video, now);
  const name = seen.gestures?.[0]?.[0]?.categoryName;
  const observed = POSE_IDS[name] ?? -1;
  const hand = seen.landmarks?.[0];
  if (hand?.length === 21) lastPoints = hand.map((point) => [point.x, point.y]);
  const required = sequence[step];
  if (observed === required && lastPoints) {
    holdStarted ??= now;
    lastMatch = now;
    const held = now - holdStarted;
    holdText.textContent = `Hold for ${(Math.max(0, HOLD_MS - held) / 1000).toFixed(1)}s.`;
    if (held >= HOLD_MS) lockMoment(Math.round(held));
  } else if (holdStarted && now - lastMatch > 140) {
    holdStarted = null;
    holdText.textContent = "Show it and hold still.";
  }
}

function lockMoment(heldMs) {
  moments.push({ pose: sequence[step], held_ms: heldMs, points: lastPoints });
  holdStarted = null;
  step += 1;
  if (step < sequence.length) {
    showPose();
    return;
  }
  finish();
}

function finish() {
  done = true;
  cancelAnimationFrame(frame);
  stream?.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
  stage.hidden = true;
  const passed = judge(sequence, moments);
  result.hidden = false;
  if (!passed) {
    resultText.textContent = "The holds did not match the three poses. Try again.";
    primary.disabled = false;
    return;
  }
  saveSession({ at: Date.now(), used: false });
  resultText.textContent = "The three holds passed. You can mint.";
  render();
  result.hidden = false;
}

render();
