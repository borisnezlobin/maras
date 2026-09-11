use tiny_keccak::{Hasher, Keccak};

/// Solady's CREATE3 proxy creation code hash. Must match shared/create3.ts.
const PROXY_INITCODE_HASH: [u8; 32] = [
    0x21, 0xc3, 0x5d, 0xbe, 0x1b, 0x34, 0x4a, 0x24, 0x88, 0xcf, 0x33, 0x21, 0xd6, 0xce, 0x54, 0x2f,
    0x8e, 0x9f, 0x30, 0x55, 0x44, 0xff, 0x09, 0xe4, 0x99, 0x3a, 0x62, 0x31, 0x9a, 0x49, 0x7c, 0x1f,
];

const SALT_OFFSET: usize = 21;
const PROXY_OFFSET: usize = 2;

pub type Address = [u8; 20];
pub type Salt = [u8; 32];

fn keccak(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    hasher.update(data);
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out
}

fn address_of(hash: &[u8; 32]) -> Address {
    let mut address = [0u8; 20];
    address.copy_from_slice(&hash[12..]);
    address
}

/// Both hash inputs are preallocated so each attempt only rewrites the salt bytes.
/// A fixed proxy is CREATE2-deployed with the salt, then deploys the real contract at nonce 1.
#[derive(Clone)]
pub struct Deriver {
    proxy_input: [u8; 85],
    final_input: [u8; 23],
}

impl Deriver {
    pub fn new(deployer: &Address) -> Self {
        let mut proxy_input = [0u8; 85];
        proxy_input[0] = 0xff;
        proxy_input[1..21].copy_from_slice(deployer);
        proxy_input[53..].copy_from_slice(&PROXY_INITCODE_HASH);

        let mut final_input = [0u8; 23];
        final_input[0] = 0xd6;
        final_input[1] = 0x94;
        final_input[22] = 0x01;

        Self { proxy_input, final_input }
    }

    pub fn derive(&mut self, salt: &Salt) -> Address {
        self.proxy_input[SALT_OFFSET..SALT_OFFSET + 32].copy_from_slice(salt);
        let proxy = address_of(&keccak(&self.proxy_input));
        self.final_input[PROXY_OFFSET..PROXY_OFFSET + 20].copy_from_slice(&proxy);
        address_of(&keccak(&self.final_input))
    }
}

pub fn leading_zero_bytes(address: &Address) -> u32 {
    address.iter().take_while(|byte| **byte == 0).count() as u32
}

/// Uniswap V4 reads a hook's permissions from the low fourteen bits of its address.
pub fn hook_bits(address: &Address) -> u16 {
    u16::from_be_bytes([address[18], address[19]]) & 0x3fff
}

pub fn nibbles(address: &Address) -> [u8; 40] {
    let mut out = [0u8; 40];
    for (index, byte) in address.iter().enumerate() {
        out[index * 2] = byte >> 4;
        out[index * 2 + 1] = byte & 0x0f;
    }
    out
}

pub fn contains_run(haystack: &[u8; 40], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|window| window == needle)
}
