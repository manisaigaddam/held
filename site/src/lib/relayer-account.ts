import { connect, keyStores, KeyPair } from "near-api-js";

export async function relayerAccount() {
  const accountId = process.env.RELAYER_ACCOUNT_ID;
  const privateKey = process.env.RELAYER_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new Error("Set RELAYER_ACCOUNT_ID and RELAYER_PRIVATE_KEY");
  }
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey("testnet", accountId, KeyPair.fromString(privateKey));
  const near = await connect({
    networkId: "testnet",
    nodeUrl: "https://rpc.testnet.near.org",
    keyStore,
  });
  return near.account(accountId);
}
