![Held](logo.jpg)

# Held

Held is a mint on NEAR. A person holds three poses chosen for that attempt. The camera stays on their computer, and the picture is not uploaded. When the hold is accepted, the mint pays a fixed amount of the coin.

One pass pays once. When it expires, the next mint asks for the poses again. The coin cannot be issued without a current pass.

## Another application

An application uses the same check by calling Held from the method it wants to protect. The page is how a person completes the poses. The call inside the application’s contract is what ties the action to the pass.

```rust
ext_held::ext(held_account)
    .is_fresh(caller, 60_000)
    .then(ext_self::ext(env::current_account_id()).on_mint(caller))
```

The follow-up method pays only when Held says the caller is still within the pass.

## Testnet

| | Account |
| --- | --- |
| Check | `held141126.testnet` |
| Coin | `coin.held141126.testnet` |
