"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useNear } from "@/components/near-provider";
import { COIN, attempt, isFresh, poseIds, poseNames, type Attempt, type Challenge } from "@/lib/chain";
const HOLD_MS = 750;
type Sample = { pose: number; at: number; confidence: number };
type OpenChallenge = Challenge & { id: number };

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toChallenge(row: Attempt): OpenChallenge {
  return {
    id: Number(row.id),
    subject: "",
    poses: row.poses,
    created_ms: 0,
    expires_ms: row.expires_ms,
    open: row.open,
  };
}

export function Launch() {
  const near = useNear();
  const videoRef = useRef<HTMLVideoElement>(null);
  const samples = useRef<Sample[]>([]);
  const sent = useRef(false);
  const finishRef = useRef<() => void>(() => {});
  const [fresh, setFresh] = useState(false);
  const [challenge, setChallenge] = useState<OpenChallenge | null>(null);
  const [heldCount, setHeldCount] = useState(0);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [seen, setSeen] = useState("Put your hand in frame.");
  const [paid, setPaid] = useState(false);

  async function refresh(accountId: string) {
    try {
      const value = Boolean(await isFresh(accountId));
      setFresh(value);
      if (value) {
        setChallenge(null);
        return true;
      }
      const row = await attempt(accountId);
      setChallenge(row?.ready ? toChallenge(row) : null);
      if (row && !row.ready) setNote("That draw is finished. Draw again.");
      return value;
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The check could not be read.");
      return false;
    }
  }

  useEffect(() => {
    if (!near.accountId) return;
    void refresh(near.accountId);
  }, [near.accountId]);

  async function requestPoses() {
    if (!near.accountId) return;
    const accountId = near.accountId;
    setBusy(true);
    setNote("Your wallet is drawing three poses.");
    const before = await attempt(accountId).catch(() => null);
    const beforeId = before ? Number(before.id) : 0;
    let stop = false;
    const watch = (async () => {
      while (!stop) {
        const row = await attempt(accountId).catch(() => null);
        if (row?.ready && Number(row.id) > beforeId) {
          setChallenge(toChallenge(row));
          sent.current = false;
          setPaid(false);
          setHeldCount(0);
          setStep(0);
          setNote("Hold each gesture until it locks.");
          return;
        }
        await wait(3000);
      }
    })();
    let walletError = "";
    try {
      await near.relay("request_challenge", {});
    } catch (error) {
      walletError = error instanceof Error ? error.message : "The wallet did not finish.";
    }
    stop = true;
    for (let i = 0; i < 8; i += 1) {
      const row = await attempt(accountId).catch(() => null);
      if (row?.ready && Number(row.id) > beforeId) {
        setChallenge(toChallenge(row));
        sent.current = false;
        setPaid(false);
        setHeldCount(0);
        setStep(0);
        setNote("Hold each gesture until it locks.");
        setBusy(false);
        return;
      }
      if (row && Number(row.id) > beforeId && !row.open) {
        setChallenge(null);
        setNote("This draw did not return three poses.");
        setBusy(false);
        return;
      }
      await wait(3000);
    }
    setNote(walletError || "The poses have not appeared yet.");
    setBusy(false);
    await watch.catch(() => undefined);
  }

  const filming = Boolean(!fresh && challenge && heldCount < 3);

  useEffect(() => {
    if (!filming || !challenge) return;
    const video = videoRef.current;
    if (!video) return;
    const poses = challenge.poses;
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    let detector: { close: () => void; recognizeForVideo: (v: HTMLVideoElement, t: number) => { gestures?: { categoryName?: string; score?: number }[][] } } | null = null;
    const run = async () => {
      samples.current = [];
      setSeen("Starting the camera.");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        const vision = await import("@mediapipe/tasks-vision");
        const files = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");
        detector = await vision.GestureRecognizer.createFromOptions(files, {
          baseOptions: {
            delegate: "CPU",
            modelAssetPath: "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          cannedGesturesClassifierOptions: {
            categoryAllowlist: Object.keys(poseIds),
            scoreThreshold: 0.75,
            maxResults: 1,
          },
        });
      } catch (error) {
        if (!stopped) setSeen(error instanceof Error ? error.message : "The camera did not start.");
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      if (stopped || !detector) return;
      setSeen("Put your hand in frame.");
      let index = 0;
      let started: number | null = null;
      let lastMatch = 0;
      let sampleAt = 0;
      let lastStamp = 0;
      let lastLine = "";
      const say = (line: string) => {
        if (line === lastLine) return;
        lastLine = line;
        setSeen(line);
      };
      const tick = () => {
        if (stopped || !detector || index >= poses.length) return;
        const now = performance.now();
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && now > lastStamp) {
          lastStamp = now;
          try {
            const result = detector.recognizeForVideo(video, now);
            const recognized = result.gestures?.[0]?.[0];
            const observed = recognized?.categoryName ? (poseIds[recognized.categoryName] ?? -1) : -1;
            const confidence = recognized?.score ?? 0;
            const required = poses[index];
            const label = observed >= 0 ? poseNames[observed] : "";
            if (observed === required && confidence >= 0.75) {
              started ??= now;
              lastMatch = now;
              if (now - sampleAt > 140) {
                samples.current.push({ pose: observed, at: Math.round(now), confidence });
                sampleAt = now;
              }
              const left = Math.max(0, HOLD_MS - (now - started));
              say(`${poseNames[required]}. Hold ${Math.ceil(left / 100) / 10}s.`);
              const seenEnough = samples.current.filter((sample) => sample.pose === required).length >= 4;
              if (now - started >= HOLD_MS && seenEnough) {
                index += 1;
                started = null;
                sampleAt = 0;
                setStep(index);
                setHeldCount(index);
                if (index >= poses.length) {
                  say("All three locked.");
                  finishRef.current();
                  return;
                }
                say(`Next: ${poseNames[poses[index]]}.`);
              }
            } else {
              if (started && now - lastMatch > 180) started = null;
              say(!label ? "Put your hand in frame." : `Seeing ${label}.`);
            }
          } catch {
            // The model skips a frame when the clock does not move forward.
          }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    void run();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      detector?.close();
      stream?.getTracks().forEach((track) => track.stop());
      if (video.srcObject) video.srcObject = null;
    };
  }, [filming, challenge]);

  async function submit() {
    if (!challenge || !near.accountId) return;
    setBusy(true);
    setNote("Checking the holds. The hand stays off the chain.");
    try {
      const response = await fetch("/api/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: near.accountId,
          challengeId: String(challenge.id),
          samples: samples.current,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The holds were not accepted");
      let accepted = false;
      for (let attempt = 0; attempt < 15 && !accepted; attempt += 1) {
        accepted = Boolean(await isFresh(near.accountId));
        if (!accepted) await wait(2000);
      }
      if (accepted) {
        setFresh(true);
        setChallenge(null);
        const params = new URLSearchParams(window.location.search);
        if (params.get("flow") === "pass") {
          window.opener?.postMessage({ type: "held:fresh", account: near.accountId }, "*");
          setNote("Captcha done. Return to the app.");
          const ret = params.get("return");
          if (ret) window.location.href = ret;
          else window.close();
          return;
        }
        setNote("Captcha done. Confirm the mint in Meteor.");
        await near.call(COIN, "mint", {}, "0");
        setPaid(true);
        await refresh(near.accountId);
        setNote("");
        const ret = params.get("return");
        if (ret) window.location.href = ret;
      } else {
        sent.current = false;
        setNote("The holds were not accepted.");
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The holds were not sent.");
    } finally {
      setBusy(false);
    }
  }

  finishRef.current = () => {
    if (sent.current) return;
    sent.current = true;
    void submit();
  };

  async function onMint() {
    if (!near.accountId) return;
    setBusy(true);
    setNote("Asking the coin whether this account is fresh.");
    try {
      if (paid) {
        setNote("Signing a new captcha.");
        await requestPoses();
        return;
      }
      const ok = Boolean(await isFresh(near.accountId));
      setFresh(ok);
      if (ok) {
        setNote("Confirm the mint in Meteor.");
        await near.call(COIN, "mint", {}, "0");
        setPaid(true);
        await refresh(near.accountId);
        setNote("");
        const ret = new URLSearchParams(window.location.search).get("return");
        if (ret) window.location.href = ret;
        return;
      }
      setNote("Captcha first. Signing the three gestures.");
      await requestPoses();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The mint did not send.";
      if (/already used|unreachable/i.test(message)) {
        setPaid(true);
        setNote("");
      } else if (/Hold the poses/i.test(message)) {
        setFresh(false);
        setNote("The coin refused. Finish the captcha, then mint.");
      } else {
        setNote(message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!near.accountId) {
    return (
      <div className="action">
        <div className="desk-top">
          <span>Captcha</span>
          <span>Testnet</span>
        </div>
        <h2>Connect a testnet wallet.</h2>
        <p>Meteor can create the account. Then this button asks the coin, and the captcha only opens when the coin would refuse.</p>
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
        <span>Captcha</span>
        <button type="button" onClick={() => void near.signOut()}>Disconnect</button>
      </div>
      <p className="who">{near.accountId}</p>
      {paid && <h2>One coin paid to this account.</h2>}
      {paid && <p>This captcha pays once. Hold a new one for another mint.</p>}
      {!paid && fresh && <h2>Captcha done.</h2>}
      {!paid && fresh && <p>One mint is open. It closes after one minute.</p>}
      {!paid && !fresh && !challenge && <h2>Captcha first.</h2>}
      {!paid && !fresh && !challenge && <p>Three gestures on this device. The coin asks before it pays.</p>}
      {!paid && !fresh && challenge && heldCount < 3 && <h2>Hold {pose === undefined ? "the gesture" : poseNames[pose]}.</h2>}
      {!paid && !fresh && challenge && heldCount === 3 && <h2>Sending the captcha.</h2>}
      {filming && (
        <div className="camera">
          <div className="stage">
            <video ref={videoRef} autoPlay playsInline muted />
          </div>
          <div className="camera-bar">
            <span>Pose {Math.min(step + 1, 3)} of 3. {seen}</span>
            <button type="button" disabled={busy} onClick={() => void requestPoses()}>New captcha</button>
          </div>
        </div>
      )}
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
      {!filming && <Button variant="clay" size="lg" disabled={busy} onClick={() => void onMint()}>{paid ? "New captcha" : "Mint"}</Button>}
      {note && <p className="note">{note}</p>}
    </div>
  );
}
