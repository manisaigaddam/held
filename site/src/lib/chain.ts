export const REGISTRY = "held141126.testnet";
export const COIN = "coin.held141126.testnet";
export const RPC = "https://rpc.testnet.near.org";
export const FRESH_MS = 60_000;
export const DRAW_DEPOSIT = "50000000000000000000000";
export const JUDGE_DEPOSIT = "50000000000000000000000";
export const GAS = "250000000000000";

export const poseNames = ["Open palm", "Closed fist", "Point up", "Thumbs up", "Thumbs down", "Victory"];

export const poseIds: Record<string, number> = {
  Open_Palm: 0,
  Closed_Fist: 1,
  Pointing_Up: 2,
  Thumb_Up: 3,
  Thumb_Down: 4,
  Victory: 5,
};

type RpcResult = { result?: { result?: number[]; error?: string } };

async function callView(method: string, args: object) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "held",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: REGISTRY,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  });
  const body = (await response.json()) as RpcResult;
  const bytes = body.result?.result;
  if (!bytes) return null;
  return JSON.parse(String.fromCharCode(...bytes));
}

export function isFresh(account: string) {
  return callView("is_fresh", { account, max_age_ms: FRESH_MS }) as Promise<boolean | null>;
}

export type Challenge = {
  subject: string;
  poses: number[];
  created_ms: number;
  expires_ms: number;
  open: boolean;
};

export function getChallenge(id: number) {
  return callView("get_challenge", { challenge_id: String(id) }) as Promise<Challenge | null>;
}

export async function latestOpenChallenge(account: string) {
  let found: (Challenge & { id: number }) | null = null;
  for (let id = 1; id < 40; id += 1) {
    const challenge = await getChallenge(id);
    if (!challenge) continue;
    if (challenge.subject === account && challenge.open && challenge.poses?.length === 3) {
      found = { ...challenge, id };
    }
  }
  return found;
}
