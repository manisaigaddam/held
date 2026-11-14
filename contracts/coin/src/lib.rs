//! The first coin. Mint asks Held, then pays a fixed amount once per pass.

use near_sdk::store::LookupMap;
use near_sdk::{env, near, serde_json, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise};

const MINT_AMOUNT: u128 = 1_000_000_000_000_000_000_000_000; // 1.000000 coin, 24 decimals
const FRESH_MS: u64 = 60_000;

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Balances,
    Used,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Coin {
    held: AccountId,
    balances: LookupMap<AccountId, u128>,
    used_pass_at: LookupMap<AccountId, u64>,
}

#[near]
impl Coin {
    #[init]
    pub fn new(held: AccountId) -> Self {
        Self {
            held,
            balances: LookupMap::new(StorageKey::Balances),
            used_pass_at: LookupMap::new(StorageKey::Used),
        }
    }

    pub fn mint(&mut self) -> Promise {
        let caller = env::predecessor_account_id();
        Promise::new(self.held.clone()).function_call(
            "is_fresh".to_string(),
            serde_json::json!({ "account": caller, "max_age_ms": FRESH_MS })
                .to_string()
                .into_bytes(),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(10),
        )
        .then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(20))
                .on_mint(caller),
        )
    }

    #[private]
    pub fn on_mint(&mut self, caller: AccountId) -> String {
        let fresh = match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(bytes) => {
                serde_json::from_slice::<bool>(&bytes).unwrap_or(false)
            }
            _ => false,
        };
        assert!(fresh, "Hold the poses first");
        let now = env::block_timestamp_ms();
        if let Some(used_at) = self.used_pass_at.get(&caller) {
            assert!(now - *used_at > FRESH_MS, "This pass was already used");
        }
        let balance = self.balances.get(&caller).copied().unwrap_or(0);
        self.balances.insert(caller.clone(), balance + MINT_AMOUNT);
        self.used_pass_at.insert(caller, now);
        "minted".to_string()
    }

    pub fn balance_of(&self, account: AccountId) -> String {
        self.balances.get(&account).copied().unwrap_or(0).to_string()
    }
}
