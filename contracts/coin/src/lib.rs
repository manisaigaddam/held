//! The first coin. This app asks for a captcha from the last minute, and pays once per captcha.

use near_sdk::json_types::U64;
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
            "fresh_id".to_string(),
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
        let captcha = match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(bytes) => {
                serde_json::from_slice::<Option<U64>>(&bytes).ok().flatten()
            }
            _ => None,
        };
        let Some(captcha) = captcha else {
            env::panic_str("Hold the gestures first");
        };
        if self.used_pass_at.get(&caller) == Some(&captcha.0) {
            env::panic_str("This captcha already paid");
        }
        let balance = self.balances.get(&caller).copied().unwrap_or(0);
        self.balances.insert(caller.clone(), balance + MINT_AMOUNT);
        self.used_pass_at.insert(caller, captcha.0);
        "minted".to_string()
    }

    pub fn balance_of(&self, account: AccountId) -> String {
        self.balances.get(&account).copied().unwrap_or(0).to_string()
    }
}
