import { NextResponse } from "next/server";
import { SCHEMA, SignedDelegate, actionCreators } from "@near-js/transactions";
import { deserialize } from "borsh";
import { relayerAccount } from "@/lib/relayer-account";

const REGISTRY = "held141126.testnet";

type Signed = {
  delegateAction: {
    senderId: string;
    receiverId: string;
    actions: Array<{ enum?: string; functionCall?: { methodName: string } }>;
  };
  signature: unknown;
};

function signedDelegateBytes(value: unknown): Buffer {
  let current = value;
  if (current && typeof current === "object") {
    const record = current as Record<string, unknown>;
    current = record.signedDelegateAction ?? record.signedDelegate ?? record.borshSerializedBase64;
  }
  if (typeof current !== "string" || current.length === 0) {
    throw new Error("The wallet returned a signature this relayer cannot read");
  }
  const trimmed = current.trim();
  if (trimmed.startsWith("{")) return signedDelegateBytes(JSON.parse(trimmed) as unknown);
  return Buffer.from(trimmed, "base64");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { signedDelegateAction?: unknown };
    if (body.signedDelegateAction == null) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }
    const signed = deserialize(SCHEMA, SignedDelegate, signedDelegateBytes(body.signedDelegateAction)) as Signed;
    const action = signed.delegateAction;
    const call = action.actions[0];
    const method = call?.functionCall?.methodName;
    if (action.receiverId !== REGISTRY || action.actions.length !== 1 || method !== "request_challenge") {
      return NextResponse.json({ error: "Only the pose draw can be relayed" }, { status: 400 });
    }
    const relayer = await relayerAccount();
    const outcome = await relayer.signAndSendTransaction({
      receiverId: action.senderId,
      actions: [actionCreators.signedDelegate({
        delegateAction: signed.delegateAction as never,
        signature: signed.signature as never,
      })],
    });
    return NextResponse.json({ ok: true, hash: outcome.transaction.hash });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The relayer did not send";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 400 });
  }
}
