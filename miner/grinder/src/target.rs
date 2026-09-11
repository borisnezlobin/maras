use crate::create3::{contains_run, hook_bits, leading_zero_bytes, nibbles, Address};

/// What a bounty or a chosen grind asks for, checked the same way the contract checks it.
#[derive(Clone, Default)]
pub struct Target {
    pub min_zero_bytes: u32,
    pub hook_mask: Option<u16>,
    /// Alternative spellings as nibbles; any one of them matching is enough.
    pub patterns: Vec<Vec<u8>>,
}

impl Target {
    pub fn is_set(&self) -> bool {
        self.min_zero_bytes > 0 || self.hook_mask.is_some() || !self.patterns.is_empty()
    }

    pub fn matches(&self, address: &Address) -> bool {
        if leading_zero_bytes(address) < self.min_zero_bytes {
            return false;
        }
        if self.hook_mask.is_some_and(|mask| hook_bits(address) != mask) {
            return false;
        }
        if self.patterns.is_empty() {
            return true;
        }
        let haystack = nibbles(address);
        self.patterns.iter().any(|pattern| contains_run(&haystack, pattern))
    }
}
