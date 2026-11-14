"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NearConnector, type NearWalletBase } from "@hot-labs/near-connect";
import { GAS, REGISTRY } from "@/lib/chain";

type NearContextValue = {
  accountId: string | null;
  ready: boolean;
  error: string | null;
  open: () => void;
  signOut: () => Promise<void>;
  call: (receiverId: string, methodName: string, args: object, deposit: string) => Promise<unknown>;
  relay: (methodName: "request_challenge", args: object, deposit: string) => Promise<unknown>;
};

const NearContext = createContext<NearContextValue | null>(null);

export function useNear() {
  const value = useContext(NearContext);
  if (!value) throw new Error("Wallet is not ready");
  return value;
}

export function NearProvider({ children }: { children: ReactNode }) {
  const [connector, setConnector] = useState<NearConnector | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const next = new NearConnector({
      network: "testnet",
      autoConnect: false,
      features: { signAndSendTransaction: true, signDelegateActions: true },
    });
    setConnector(next);
    let cancel = false;
    void next.whenManifestLoaded.then(() => {
      if (!cancel) setReady(true);
    });
    void next.wallet().then(async (existing) => {
      if (cancel || !existing) return;
      setWallet(existing);
      const accounts = await existing.getAccounts();
      if (!cancel) setAccountId(accounts[0]?.accountId ?? null);
    }).catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  const value = useMemo<NearContextValue>(() => ({
    accountId,
    ready,
    error,
    open: () => {
      connector?.connect().then(async (connected) => {
        setWallet(connected);
        const accounts = await connected.getAccounts();
        setAccountId(accounts[0]?.accountId ?? null);
        setError(null);
      }).catch((reason) => {
        setError(reason instanceof Error ? reason.message : "The wallet did not connect");
      });
    },
    signOut: async () => {
      if (!connector || !wallet) return;
      await connector.disconnect(wallet);
      setWallet(null);
      setAccountId(null);
    },
    call: async (receiverId, methodName, args, deposit) => {
      const signer = wallet ?? await connector?.wallet();
      if (!signer || !accountId) throw new Error("Connect a testnet wallet first");
      return signer.signAndSendTransaction({
        signerId: accountId,
        receiverId,
        actions: [{
          type: "FunctionCall",
          params: { methodName, args, gas: GAS, deposit },
        }],
      });
    },
    relay: async (methodName, args, deposit) => {
      const signer = wallet ?? await connector?.wallet();
      if (!signer || !accountId) throw new Error("Connect a testnet wallet first");
      const signed = await signer.signDelegateActions({
        signerId: accountId,
        delegateActions: [{
          receiverId: REGISTRY,
          actions: [{
            type: "FunctionCall",
            params: { methodName, args, gas: GAS, deposit },
          }],
        }],
      });
      const response = await fetch("/api/relay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedDelegateAction: signed.signedDelegateActions[0] }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The relayer did not send");
      return body;
    },
  }), [accountId, connector, wallet, error, ready]);

  return <NearContext.Provider value={value}>{children}</NearContext.Provider>;
}
