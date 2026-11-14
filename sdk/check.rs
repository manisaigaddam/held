//! Paste this into the method you want to protect.
//! `held` is `held141126.testnet`. The coin at `coin.held141126.testnet` is the example.

use near_sdk::{env, near, serde_json, AccountId, Gas, NearToken, Promise};

#[near]
impl Contract {
    pub fn claim(&mut self) -> Promise {
        let caller = env::predecessor_account_id();
        Promise::new("held141126.testnet".parse().unwrap()).function_call(
            "is_fresh".to_string(),
            serde_json::json!({ "account": caller, "max_age_ms": 60_000u64 })
                .to_string()
                .into_bytes(),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(10),
        )
        .then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(20))
                .on_claim(caller),
        )
    }

    #[private]
    pub fn on_claim(&mut self, caller: AccountId) {
        let fresh = match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(bytes) => {
                serde_json::from_slice::<bool>(&bytes).unwrap_or(false)
            }
            _ => false,
        };
        assert!(fresh, "Hold the poses first");
        let _ = caller;
    }
}
