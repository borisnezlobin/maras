use std::collections::HashMap;

use crate::create3::{hook_bits, leading_zero_bytes, nibbles, Address};

const WORDS: &str = include_str!("../words.txt");

const PREFIX_NIBBLES: usize = 4;
const ADDRESS_NIBBLES: usize = 40;
const HOOK_BITS: u32 = 14;

/// Below this many permissions a hook address is common enough that claiming it adds nothing.
const MIN_NOTABLE_PERMISSIONS: u32 = 12;

pub struct Word {
    pub hex: String,
    pub english: String,
    nibbles: Vec<u8>,
    bits: f64,
}

/// Everything true about an address that is worth putting in a listing, and how rare that is.
pub struct Find<'a> {
    pub zero_bytes: u32,
    pub hook_mask: Option<u16>,
    pub word: Option<&'a Word>,
    pub bits: f64,
}

/// Scans every address for byproducts worth listing. The prefix bitmap rejects almost every
/// window in one lookup, so scanning costs a small fraction of the two hashes it follows.
pub struct Scanner {
    prefix_seen: Vec<u64>,
    by_prefix: HashMap<u16, Vec<Word>>,
    hook_rarity: [f64; HOOK_BITS as usize + 1],
}

fn to_nibbles(hex: &str) -> Vec<u8> {
    hex.chars().map(|c| c.to_digit(16).expect("words.txt holds hex") as u8).collect()
}

fn prefix_of(nibbles: &[u8]) -> u16 {
    nibbles[..PREFIX_NIBBLES].iter().fold(0u16, |acc, n| (acc << 4) | *n as u16)
}

/// A run of `len` nibbles can start at any of `41 - len` positions, and any of the `peers`
/// dictionary words that long would have been reported just the same, so all of them count
/// against the rarity. Otherwise a 271-word dictionary flags "some word" as if it were one word.
fn word_bits(len: usize, peers: usize) -> f64 {
    4.0 * len as f64 - ((ADDRESS_NIBBLES + 1 - len) as f64).log2() - (peers as f64).log2()
}

fn choose(n: u32, k: u32) -> f64 {
    (0..k).fold(1.0, |acc, i| acc * (n - i) as f64 / (i + 1) as f64)
}

/// Bits of rarity for carrying at least `n` of the fourteen permissions.
fn hook_rarity_table() -> [f64; HOOK_BITS as usize + 1] {
    let mut table = [0.0; HOOK_BITS as usize + 1];
    for (n, entry) in table.iter_mut().enumerate() {
        let at_least: f64 = (n as u32..=HOOK_BITS).map(|k| choose(HOOK_BITS, k)).sum();
        *entry = (2f64.powi(HOOK_BITS as i32) / at_least).log2();
    }
    table
}

impl Scanner {
    pub fn new() -> Self {
        let mut prefix_seen = vec![0u64; 1 << 10];
        let mut by_prefix: HashMap<u16, Vec<Word>> = HashMap::new();

        let entries: Vec<(&str, &str)> = WORDS
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| line.split_once(' ').expect("words.txt lines are `hex word`"))
            .collect();
        let mut peers: HashMap<usize, usize> = HashMap::new();
        for (hex, _) in &entries {
            *peers.entry(hex.len()).or_default() += 1;
        }

        for (hex, english) in entries {
            let nibbles = to_nibbles(hex);
            let prefix = prefix_of(&nibbles);
            prefix_seen[prefix as usize / 64] |= 1 << (prefix % 64);
            by_prefix.entry(prefix).or_default().push(Word {
                hex: hex.to_string(),
                english: english.to_string(),
                bits: word_bits(nibbles.len(), peers[&nibbles.len()]),
                nibbles,
            });
        }

        Self { prefix_seen, by_prefix, hook_rarity: hook_rarity_table() }
    }

    fn best_word(&self, haystack: &[u8; 40]) -> Option<&Word> {
        let mut best: Option<&Word> = None;
        for start in 0..=ADDRESS_NIBBLES - PREFIX_NIBBLES {
            let prefix = prefix_of(&haystack[start..]);
            if self.prefix_seen[prefix as usize / 64] & (1 << (prefix % 64)) == 0 {
                continue;
            }
            let fits = |word: &&Word| haystack[start..].starts_with(&word.nibbles);
            for word in self.by_prefix[&prefix].iter().filter(fits) {
                if best.is_none_or(|current| word.bits > current.bits) {
                    best = Some(word);
                }
            }
        }
        best
    }

    fn notable_hook(&self, address: &Address) -> Option<(u16, f64)> {
        let mask = hook_bits(address);
        let permissions = mask.count_ones();
        (permissions >= MIN_NOTABLE_PERMISSIONS).then(|| (mask, self.hook_rarity[permissions as usize]))
    }

    pub fn scan(&self, address: &Address) -> Find<'_> {
        let zero_bytes = leading_zero_bytes(address);
        let hook = self.notable_hook(address);
        let word = self.best_word(&nibbles(address));

        let bits = 8.0 * zero_bytes as f64
            + hook.map_or(0.0, |(_, bits)| bits)
            + word.map_or(0.0, |word| word.bits);

        Find { zero_bytes, hook_mask: hook.map(|(mask, _)| mask), word, bits }
    }
}
