import { NextResponse } from "next/server";
import BN from "bn.js";
import { getChallenge, REGISTRY } from "@/lib/chain";
import { poseMatches } from "@/lib/poses";
import { relayerAccount } from "@/lib/relayer-account";

type Moment = { pose: number; held_ms: number; points: number[][] };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { account?: string; challengeId?: string; moments?: Moment[] };
    const account = body.account ?? "";
    const challengeId = Number(body.challengeId);
    const moments = body.moments ?? [];
    const challenge = await getChallenge(challengeId);
    if (!challenge || challenge.subject !== account || !challenge.open || challenge.poses.length !== 3) {
      return NextResponse.json({ error: "That draw is not open" }, { status: 400 });
    }
    if (Date.now() > challenge.expires_ms) {
      return NextResponse.json({ error: "That draw has expired" }, { status: 400 });
    }
    const matched = moments.length === 3 && moments.every((moment, index) => (
      moment.pose === challenge.poses[index]
      && moment.held_ms >= 750
      && poseMatches(challenge.poses[index], moment.points)
    ));
    if (!matched) {
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
