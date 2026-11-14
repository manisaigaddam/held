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

## Testnet

| | Account |
| --- | --- |
| Check | `held141126.testnet` |
| Coin | `coin.held141126.testnet` |

## Later

The judge can move into a locked room on OutLayer, so this server is not the one that decides. The chain would still store the minute, not the hand. That room is not in this version. Its worker was missing NEAR’s two-minute wait.
