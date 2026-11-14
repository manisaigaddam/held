![Held](logo.jpg)

# Held

Bots mint a coin by calling the contract. A check that lives only in a website does not stop them. They skip the website.

Held is a captcha on NEAR and the first coin that uses it. A person holds three gestures chosen for that mint. The picture stays on their device. The server sees the pose name, the time, and a confidence score. The chain stores the account and the minute, not the hand.

The captcha has no expiry of its own. The contract that asks passes the window, as GestureGate does with `isVerifiedWithin`. This coin asks for the last minute and pays once per captcha. A new captcha mints again. Another app can use the same captcha for as long as its own window allows.

## What it provides

- A captcha any contract can ask about, with the window passed by that contract.
- This coin pays once per captcha. Another app is not used up by that mint.
- The camera in the user’s browser. No finger positions are stored or sent to the chain.
- A browser helper, `sdk/index.ts`, that reads the check and opens the captcha when needed.
- The contract call in `sdk/check.rs`. The example that already uses it is `coin.held141126.testnet`.

## Another application

The page can open the captcha. The method being protected still has to ask.

```rust
ext_held::ext(held_account)
    .is_fresh(caller, 60_000)
    .then(ext_self::ext(env::current_account_id()).on_claim(caller))
```

The follow-up runs only when Held says the caller is still inside the minute.

## Try it

Hosted: https://held-near.vercel.app

1. Open the site in Chrome. Install Meteor and create a testnet account if you do not have one. Request testnet NEAR from the faucet inside Meteor.
2. Connect the wallet. Click **Mint**.
3. If the card says **Captcha done**, approve the mint in Meteor. See **One coin paid to this account.**
4. Click **Mint** again while it still says Mint. The coin refuses a second payment for the same captcha.
5. Click **New captcha**. Hold the three gestures the camera names. See the card return to a mint.
6. Open **For apps**. The protected method calls `held141126.testnet.is_fresh`. The example is `coin.held141126.testnet`.

Local site, from `site/`:

```sh
npm install
npm run dev
```

The pose draw and the pass need `RELAYER_ACCOUNT_ID` and `RELAYER_PRIVATE_KEY` in the environment. Without them, the draw is sent from the connected wallet. The mint is always signed by that wallet.

## Testnet

| | Account |
| --- | --- |
| Check | `held141126.testnet` |
| Coin | `coin.held141126.testnet` |

## Built with

MediaPipe gesture recognition in the browser, NEAR Connect for Meteor, and `near-api-js` for the relayer. The captcha shape follows GestureGate. The NEAR contracts, the required `is_fresh` call, and this coin were built for this hackathon. AI tools were used to write code.

## Later

The judge can move into a locked room on OutLayer, so this server is not the one that decides. The chain would still store the minute, not the hand. That room is not in this version. Its worker was missing NEAR’s two-minute wait.
