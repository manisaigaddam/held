export const heldCheck = "held141126.testnet";
export const heldCoin = "coin.held141126.testnet";
export const heldOrigin = "https://held-near.vercel.app";

const RPC = "https://rpc.testnet.near.org";

export async function isFresh(account: string, maxAgeMs = 60_000) {
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
        account_id: heldCheck,
        method_name: "is_fresh",
        args_base64: btoa(JSON.stringify({ account, max_age_ms: maxAgeMs })),
      },
    }),
  });
  const body = (await response.json()) as { result?: { result?: number[] } };
  const bytes = body.result?.result;
  if (!bytes) return false;
  return JSON.parse(String.fromCharCode(...bytes)) === true;
}

export function openHeld(account: string) {
  if (typeof window === "undefined") throw new Error("Open Held in the user's browser.");
  const popup = window.open(`${heldOrigin}/?flow=pass`, "held", "popup,width=480,height=760");
  if (!popup) throw new Error("The browser blocked the Held window.");
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The hold window expired."));
    }, 180_000);
    const closed = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The hold window was closed."));
    }, 500);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== heldOrigin || event.data?.type !== "held:fresh" || event.data.account !== account) return;
      cleanup();
      popup.close();
      resolve();
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      window.clearInterval(closed);
      window.removeEventListener("message", onMessage);
    };
    window.addEventListener("message", onMessage);
  });
}

export async function ensureFresh(account: string, maxAgeMs = 60_000) {
  if (await isFresh(account, maxAgeMs)) return;
  await openHeld(account);
  if (!(await isFresh(account, maxAgeMs))) {
    throw new Error("The hold finished, and the pass is not on the check yet.");
  }
}
