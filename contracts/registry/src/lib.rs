//! Held registry.
//!
//! A challenge stores the three poses drawn from the block seed. A pass stores
//! the time an account completed them. The dots are checked here and are not kept.

use near_sdk::json_types::U64;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault, Promise};
use serde::{Deserialize, Serialize};

const CHALLENGE_TTL_MS: u64 = 180_000;

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

    /// Draw three poses for the caller. The block seed is NEAR's VRF output for this block.
    #[payable]
    pub fn request_challenge(&mut self) -> U64 {
        self.refund_attached();
        let subject = env::predecessor_account_id();
        let id = self.next_id;
        self.next_id += 1;
        let now = env::block_timestamp_ms();
        let poses = draw_three(env::random_seed_array(), id, &subject);
        self.challenges.insert(
            id,
            Challenge {
                subject,
                poses: poses.to_vec(),
                created_ms: now,
                expires_ms: now + CHALLENGE_TTL_MS,
                open: true,
            },
        );
        env::log_str(&format!("poses:{id}:{},{},{}", poses[0], poses[1], poses[2]));
        U64(id)
    }

    /// Check the three holds here. A pass stores only the time.
    #[payable]
    pub fn submit_hold(&mut self, challenge_id: U64, moments: Vec<Moment>) {
        self.refund_attached();
        let subject = env::predecessor_account_id();
        let mut challenge = self
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
        for (moment, required) in moments.iter().zip(challenge.poses.iter()) {
            assert_eq!(moment.pose, *required, "The holds are in the wrong order");
            assert!(moment.held_ms >= 750, "Hold each pose a little longer");
            assert_eq!(moment.points.len(), 21, "A hold is missing its points");
        }
        challenge.open = false;
        self.challenges.insert(challenge_id.0, challenge);
        self.fresh.insert(
            subject,
            Fresh {
                at_ms: env::block_timestamp_ms(),
                challenge_id: challenge_id.0,
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

    /// The newest attempt for this account, in one read.
    pub fn attempt(&self, account: AccountId) -> Option<Attempt> {
        let now = env::block_timestamp_ms();
        let mut id = self.next_id;
        let mut looked = 0u32;
        while id > 1 && looked < 40 {
            id -= 1;
            looked += 1;
            let Some(challenge) = self.challenges.get(&id) else {
                continue;
            };
            if challenge.subject != account {
                continue;
            }
            let ready = challenge.open && challenge.poses.len() == 3 && now <= challenge.expires_ms;
            return Some(Attempt {
                id: U64(id),
                poses: challenge.poses.clone(),
                open: challenge.open,
                expires_ms: challenge.expires_ms,
                ready,
            });
        }
        None
    }

    fn refund_attached(&self) {
        let deposit = env::attached_deposit();
        if deposit.as_yoctonear() > 0 {
            Promise::new(env::predecessor_account_id()).transfer(deposit).detach();
        }
    }
}

fn draw_three(seed: [u8; 32], id: u64, account: &AccountId) -> [u8; 3] {
    let mut state = u64::from_le_bytes(seed[..8].try_into().unwrap());
    state ^= id.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    for (index, byte) in account.as_bytes().iter().enumerate() {
        state ^= (*byte as u64) << ((index % 8) * 8);
    }
    state |= 1;
    let mut next = || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        (state % 6) as u8
    };
    let mut poses = [0u8; 3];
    let mut used = [false; 6];
    for pose in &mut poses {
        loop {
            let pick = next();
            if !used[pick as usize] {
                used[pick as usize] = true;
                *pose = pick;
                break;
            }
        }
    }
    poses
}

#[near(serializers = [json])]
pub struct Attempt {
    pub id: U64,
    pub poses: Vec<u8>,
    pub open: bool,
    pub expires_ms: u64,
    pub ready: bool,
}
