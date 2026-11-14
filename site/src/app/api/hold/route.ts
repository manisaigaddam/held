import { NextResponse } from "next/server";
import BN from "bn.js";
import { getChallenge, REGISTRY } from "@/lib/chain";
import { relayerAccount } from "@/lib/relayer-account";

type Sample = { pose: number; at: number; confidence: number };

function samplesMatch(poses: number[], samples: Sample[]) {
  if (samples.length < 9 || samples.length > 150) return false;
  if (poses.length !== 3 || new Set(poses).size !== 3) return false;
  const groups = poses.map((pose) => samples.filter((sample) => sample.pose === pose && sample.confidence >= 0.75));
  if (groups.some((group) => group.length < 3)) return false;
  const starts = groups.map((group) => Math.min(...group.map((sample) => sample.at)));
  const ends = groups.map((group) => Math.max(...group.map((sample) => sample.at)));
  return starts[0] < starts[1] && starts[1] < starts[2]
    && ends.every((end, index) => end - starts[index] >= 250)
    && samples.every((sample) => Number.isFinite(sample.at) && sample.at > 0 && sample.confidence <= 1);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { account?: string; challengeId?: string; samples?: Sample[] };
    const account = body.account ?? "";
    const challengeId = Number(body.challengeId);
    const samples = body.samples ?? [];
    const challenge = await getChallenge(challengeId);
    if (!challenge || challenge.subject !== account || !challenge.open || challenge.poses.length !== 3) {
      return NextResponse.json({ error: "That draw is not open" }, { status: 400 });
    }
    if (Date.now() > challenge.expires_ms) {
      return NextResponse.json({ error: "That draw has expired" }, { status: 400 });
    }
    if (!samplesMatch(challenge.poses, samples)) {
      return NextResponse.json({ error: "The holds did not match" }, { status: 400 });
    }
    const relayer = await relayerAccount();
    const outcome = await relayer.functionCall({
      contractId: REGISTRY,
      methodName: "grant",
      args: { account, challenge_id: String(challengeId) },
      gas: new BN("300000000000000"),
      attachedDeposit: new BN("0"),
    });
    return NextResponse.json({ ok: true, hash: outcome.transaction.hash });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The pass was not recorded";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 400 });
  }
}
