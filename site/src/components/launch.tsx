"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useNear } from "@/components/near-provider";
import { COIN, DRAW_DEPOSIT, JUDGE_DEPOSIT, REGISTRY, getChallenge, isFresh, latestOpenChallenge, poseIds, poseNames, type Challenge } from "@/lib/chain";
import { poseMatches } from "@/lib/poses";

const HOLD_MS = 750;
type Moment = { pose: number; held_ms: number; points: number[][] };
type OpenChallenge = Challenge & { id: number };

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function newestOpenId(account: string) {
  let found: number | null = null;
  let misses = 0;
  for (let id = 1; id < 200 && misses < 2; id += 1) {
    const challenge = await getChallenge(id);
    if (!challenge) {
      misses += 1;
      continue;
    }
    misses = 0;
    if (challenge.subject === account && challenge.open) found = id;
  }
  return found;
}

export function Launch() {
  const near = useNear();
  const videoRef = useRef<HTMLVideoElement>(null);
  const moments = useRef<Moment[]>([]);
  const [fresh, setFresh] = useState(false);
  const [challenge, setChallenge] = useState<OpenChallenge | null>(null);
  const [heldCount, setHeldCount] = useState(0);
  const [step, setStep] = useState(0);
  const [holding, setHolding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function refresh(accountId: string) {
    const value = Boolean(await isFresh(accountId));
    setFresh(value);
    setChallenge(value ? null : await latestOpenChallenge(accountId));
    return value;
  }

  useEffect(() => {
    if (!near.accountId) return;
    void refresh(near.accountId);
  }, [near.accountId]);

  async function requestPoses() {
    if (!near.accountId) return;
    setBusy(true);
    setNote("Your wallet is paying the room to draw three poses.");
    try {
      await near.call(REGISTRY, "request_challenge", {}, DRAW_DEPOSIT);
      const accountId = near.accountId;
      let id: number | null = null;
      for (let attempt = 0; attempt < 8 && id == null; attempt += 1) {
        id = await newestOpenId(accountId);
        if (id == null) await wait(1500);
      }
      let drawn: OpenChallenge | null = null;
      for (let attempt = 0; attempt < 16 && id != null && !drawn; attempt += 1) {
        const stored = await getChallenge(id);
        if (stored?.poses?.length === 3) drawn = { ...stored, id };
        else await wait(2000);
      }
      setChallenge(drawn);
      setHeldCount(0);
      setStep(0);
      setNote(drawn ? "Three poses. Hold each one until it locks." : "The poses have not landed yet. Ask again in a moment.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The request did not send.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!holding || !challenge) return;
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      } catch (error) {
        if (!stopped) {
          setHolding(false);
          setNote(error instanceof Error ? error.message : "The camera did not start.");
        }
        return;
      }
      if (stopped || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/+esm");
      const files = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm");
      const detector = await vision.GestureRecognizer.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });
      let index = 0;
      let started: number | null = null;
      let lastMatch = 0;
      let lastPoints: number[][] | null = null;
      const tick = () => {
        if (stopped || !videoRef.current || index >= challenge.poses.length) return;
        const now = performance.now();
        const seen = detector.recognizeForVideo(video, now);
        const name = seen.gestures?.[0]?.[0]?.categoryName;
        const observed = name ? (poseIds[name] ?? -1) : -1;
        const hand = seen.landmarks?.[0];
        if (hand?.length === 21) lastPoints = hand.map((point) => [point.x, point.y]);
        const required = challenge.poses[index];
        if (observed === required && lastPoints && poseMatches(required, lastPoints)) {
          started ??= now;
          lastMatch = now;
          if (now - started >= HOLD_MS) {
            moments.current.push({ pose: required, held_ms: Math.round(now - started), points: lastPoints });
            index += 1;
            started = null;
            setStep(index);
            setHeldCount(index);
            if (index >= challenge.poses.length) {
              stream?.getTracks().forEach((track) => track.stop());
              video.srcObject = null;
              setHolding(false);
              setNote("All three locked. Send them.");
              return;
            }
          }
        } else if (started && now - lastMatch > 140) started = null;
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    void run();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [holding, challenge]);

  function startHold() {
    if (!challenge) return;
    moments.current = [];
    setHeldCount(0);
    setStep(0);
    setNote("");
    setHolding(true);
  }

  async function submit() {
    if (!challenge || !near.accountId) return;
    setBusy(true);
    setNote("The room is judging the three holds.");
    try {
      await near.call(REGISTRY, "submit_hold", { challenge_id: String(challenge.id), moments: moments.current }, JUDGE_DEPOSIT);
      let accepted = false;
      for (let attempt = 0; attempt < 15 && !accepted; attempt += 1) {
        accepted = Boolean(await isFresh(near.accountId));
        if (!accepted) await wait(2000);
      }
      if (accepted) {
        setFresh(true);
        setChallenge(null);
        setNote("Pass accepted. It lasts one minute. Mint while it is still true.");
      } else {
        setNote("The room has not accepted these holds.");
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The holds were not sent.");
    } finally {
      setBusy(false);
    }
  }

  async function mint() {
    if (!near.accountId) return;
    setBusy(true);
    setNote("The coin is reading the pass from the check.");
    try {
      await near.call(COIN, "mint", {}, "0");
      await refresh(near.accountId);
      setNote("One coin paid to this account.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The mint was not sent.");
    } finally {
      setBusy(false);
    }
  }

  if (!near.accountId) {
    return (
      <div className="action">
        <div className="desk-top">
          <span>This attempt</span>
          <span>Testnet</span>
        </div>
        <h2>Connect, then the page reads your pass.</h2>
        <p>Meteor creates the testnet account. Request testnet NEAR from the faucet inside that wallet, then come back to this button.</p>
        <Button variant="clay" size="lg" onClick={near.open} disabled={!near.ready || busy}>
          {near.ready ? "Connect wallet" : "Loading wallets"}
        </Button>
        {near.error && <p className="warn">{near.error}</p>}
      </div>
    );
  }

  const pose = challenge?.poses[step];
  return (
    <div className="action">
      <div className="desk-top">
        <span>This attempt</span>
        <button type="button" onClick={() => void near.signOut()}>Disconnect</button>
      </div>
      <p className="who">{near.accountId}</p>
      {holding && pose !== undefined ? (
        <div className="camera">
          <strong>{poseNames[pose]}</strong>
          <video ref={videoRef} autoPlay playsInline muted />
          <div className="camera-bar">
            <span>Pose {Math.min(step + 1, 3)} of 3. Hold still.</span>
            <button type="button" onClick={() => setHolding(false)}>Close</button>
          </div>
        </div>
      ) : (
        <>
          {fresh && <h2>This account is fresh. The camera stays off.</h2>}
          {!fresh && !challenge && <h2>No pass on this account.</h2>}
          {!fresh && challenge && heldCount < 3 && <h2>Hold these, in order.</h2>}
          {!fresh && challenge && heldCount === 3 && <h2>The holds are ready to send.</h2>}
          {challenge && !fresh && (
            <ol className="poses">
              {challenge.poses.map((id, index) => (
                <li key={`${id}-${index}`} className={index < heldCount ? "done" : index === step ? "now" : ""}>
                  <em>{index + 1}</em>
                  <span>{poseNames[id]}</span>
                </li>
              ))}
            </ol>
          )}
          {fresh && <Button variant="clay" size="lg" disabled={busy} onClick={() => void mint()}>Mint</Button>}
          {!fresh && !challenge && <Button variant="clay" size="lg" disabled={busy} onClick={() => void requestPoses()}>Get the poses</Button>}
          {!fresh && challenge && heldCount < 3 && <Button variant="clay" size="lg" disabled={busy || holding} onClick={startHold}>Open the camera</Button>}
          {!fresh && challenge && heldCount === 3 && <Button variant="clay" size="lg" disabled={busy} onClick={() => void submit()}>Send the holds</Button>}
        </>
      )}
      {note && <p className="note">{note}</p>}
    </div>
  );
}
