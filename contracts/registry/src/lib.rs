//! Held registry.
//!
//! A challenge stores the three poses that were drawn. A pass stores the time
//! an account completed them. The dots from a hold are forwarded to the room
//! and are not kept here.

use near_sdk::json_types::U64;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise};
use serde::{Deserialize, Serialize};

const OUTLAYER_TESTNET: &str = "outlayer.testnet";
const DRAW_DEPOSIT: NearToken = NearToken::from_millinear(20);
const JUDGE_DEPOSIT: NearToken = NearToken::from_millinear(30);
const CHALLENGE_TTL_MS: u64 = 90_000;

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Challenges,
    Fresh,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Moment {
    pub pose: u8,
    pub held_ms: u32,
    pub points: Vec<[f32; 2]>,
}

#[derive(Clone)]
#[near(serializers = [json, borsh])]
pub struct Challenge {
    pub subject: AccountId,
    pub poses: Vec<u8>,
    pub created_ms: u64,
    pub expires_ms: u64,
    pub open: bool,
}

#[derive(Clone)]
#[near(serializers = [json, borsh])]
pub struct Fresh {
    pub at_ms: u64,
    pub challenge_id: u64,
}

#[derive(Deserialize)]
struct DrawOutput {
    poses: Vec<u8>,
}

#[derive(Deserialize)]
struct JudgeOutput {
    pass: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Registry {
    next_id: u64,
    project_id: String,
    challenges: LookupMap<u64, Challenge>,
    fresh: LookupMap<AccountId, Fresh>,
}

#[near]
impl Registry {
    #[init]
    pub fn new(project_id: String) -> Self {
        Self {
            next_id: 1,
            project_id,
            challenges: LookupMap::new(StorageKey::Challenges),
            fresh: LookupMap::new(StorageKey::Fresh),
        }
    }

    /// Ask the room for three poses. The account that calls is the subject.
    #[payable]
    pub fn request_challenge(&mut self) -> Promise {
        let deposit = env::attached_deposit();
        assert!(deposit >= DRAW_DEPOSIT, "Attach at least 0.02 NEAR");
        let subject = env::predecessor_account_id();
        let id = self.next_id;
        self.next_id += 1;
        let now = env::block_timestamp_ms();
        self.challenges.insert(
            id,
            Challenge {
                subject: subject.clone(),
                poses: Vec::new(),
                created_ms: now,
                expires_ms: now + CHALLENGE_TTL_MS,
                open: true,
            },
        );
        self.call_room(
            serde_json::json!({ "action": "draw", "subject": subject, "challengeId": id, "seed": now }).to_string(),
            deposit,
        )
        .then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(30))
                .on_draw(id),
        )
    }

    #[private]
    pub fn on_draw(&mut self, challenge_id: u64) {
        let challenge = self
            .challenges
            .get(&challenge_id)
            .expect("challenge")
            .clone();
        if !challenge.open || env::block_timestamp_ms() > challenge.expires_ms {
            return;
        }
        let text = match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(bytes) => String::from_utf8(bytes).unwrap_or_default(),
            _ => return,
        };
        let Ok(drawn) = serde_json::from_str::<DrawOutput>(&text) else {
            return;
        };
        if drawn.poses.len() != 3 || drawn.poses.iter().any(|pose| *pose > 5) {
            return;
        }
        if drawn.poses[0] == drawn.poses[1]
            || drawn.poses[1] == drawn.poses[2]
            || drawn.poses[0] == drawn.poses[2]
        {
            return;
        }
        let mut stored = challenge;
        stored.poses = drawn.poses;
        self.challenges.insert(challenge_id, stored);
    }

    /// Send the three held moments. The room judges them against the stored poses.
    #[payable]
    pub fn submit_hold(&mut self, challenge_id: U64, moments: Vec<Moment>) -> Promise {
        let deposit = env::attached_deposit();
        assert!(deposit >= JUDGE_DEPOSIT, "Attach at least 0.03 NEAR");
        let subject = env::predecessor_account_id();
        let challenge = self
            .challenges
            .get(&challenge_id.0)
            .expect("challenge")
            .clone();
        assert_eq!(challenge.subject, subject, "This challenge belongs to another account");
        assert!(challenge.open, "This challenge is already finished");
        assert!(
            env::block_timestamp_ms() <= challenge.expires_ms,
            "This challenge has expired"
        );
        assert_eq!(challenge.poses.len(), 3, "The poses are not ready");
        assert_eq!(moments.len(), 3, "Three holds are required");

        self.call_room(
            serde_json::json!({
                "action": "judge",
                "version": 1,
                "subject": subject,
                "challengeId": challenge_id.0,
                "poses": challenge.poses,
                "moments": moments,
            })
            .to_string(),
            deposit,
        )
        .then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(40))
                .on_judge(challenge_id.0, subject),
        )
    }

    #[private]
    pub fn on_judge(&mut self, challenge_id: u64, subject: AccountId) {
        let text = match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(bytes) => String::from_utf8(bytes).unwrap_or_default(),
            _ => return,
        };
        let Ok(judge) = serde_json::from_str::<JudgeOutput>(&text) else {
            return;
        };
        if !judge.pass {
            return;
        }
        let Some(mut challenge) = self.challenges.get(&challenge_id).cloned() else {
            return;
        };
        if !challenge.open || challenge.subject != subject {
            return;
        }
        if env::block_timestamp_ms() > challenge.expires_ms {
            challenge.open = false;
            self.challenges.insert(challenge_id, challenge);
            return;
        }
        challenge.open = false;
        self.challenges.insert(challenge_id, challenge);
        self.fresh.insert(
            subject,
            Fresh {
                at_ms: env::block_timestamp_ms(),
                challenge_id,
            },
        );
    }

    pub fn is_fresh(&self, account: AccountId, max_age_ms: u64) -> bool {
        self.fresh.get(&account).is_some_and(|fresh| {
            let now = env::block_timestamp_ms();
            now >= fresh.at_ms && now - fresh.at_ms <= max_age_ms
        })
    }

    pub fn get_challenge(&self, challenge_id: U64) -> Option<Challenge> {
        self.challenges.get(&challenge_id.0).cloned()
    }

    fn call_room(&self, input: String, deposit: NearToken) -> Promise {
        Promise::new(OUTLAYER_TESTNET.parse().unwrap()).function_call(
            "request_execution".to_string(),
            serde_json::json!({
                "source": { "Project": { "project_id": self.project_id, "version_key": null } },
                "resource_limits": {
                    "max_instructions": 5_000_000_000u64,
                    "max_memory_mb": 128,
                    "max_execution_seconds": 30
                },
                "input_data": input,
                "secrets_ref": null,
                "response_format": "Json",
                "payer_account_id": env::predecessor_account_id(),
            })
            .to_string()
            .into_bytes(),
            deposit,
            Gas::from_tgas(80),
        )
    }
}
