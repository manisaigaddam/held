import { readFileSync } from "fs";
import { NextResponse } from "next/server";
import { connect, keyStores, KeyPair } from "near-api-js";
import { SCHEMA, SignedDelegate, actionCreators } from "@near-js/transactions";
import { deserialize } from "borsh";

export const runtime = "nodejs";

const REGISTRY = "held141126.testnet";
const ALLOWED = new Set(["request_challenge", "submit_hold"]);

type Signed = {
  delegateAction: {
    senderId: string;
    receiverId: string;
    actions: Array<{ enum?: string; functionCall?: { methodName: string } }>;
  };
  signature: unknown;
};

function credentials() {
  const path = process.env.RELAYER_CREDENTIALS
    ?? "C:\\Users\\saiga\\.near-credentials\\testnet\\held141126.testnet.json";
  return JSON.parse(readFileSync(path, "utf8")) as { account_id: string; private_key: string };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { signedDelegateAction?: string };
    if (!body.signedDelegateAction) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }
    const signed = deserialize(
      SCHEMA,
      SignedDelegate,
      Buffer.from(body.signedDelegateAction, "base64"),
    ) as Signed;
    const action = signed.delegateAction;
    if (action.receiverId !== REGISTRY) {
      return NextResponse.json({ error: "Only the check can be relayed" }, { status: 400 });
    }
    if (action.actions.length !== 1) {
      return NextResponse.json({ error: "One captcha call at a time" }, { status: 400 });
    }
    const call = action.actions[0];
    const method = call.functionCall?.methodName;
    if (call.enum !== "functionCall" || !method || !ALLOWED.has(method)) {
      return NextResponse.json({ error: "Only the two captcha calls can be relayed" }, { status: 400 });
    }
    const creds = credentials();
    const keyStore = new keyStores.InMemoryKeyStore();
    await keyStore.setKey("testnet", creds.account_id, KeyPair.fromString(creds.private_key));
    const near = await connect({
      networkId: "testnet",
      nodeUrl: "https://rpc.testnet.near.org",
      keyStore,
    });
    const relayer = await near.account(creds.account_id);
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
