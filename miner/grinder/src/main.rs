//! Grinds CREATE3 salts for a Maras target and reports rare byproducts along the way.
//!
//! Every result is one JSON line on stdout; progress goes to stderr.
//!   {"type":"target", ...}  the salt satisfies --zeros/--hook-mask/--pattern; the run stops
//!   {"type":"find", ...}    an address at least --list-above bits rare, with the claims to list it

mod create3;
mod rarity;
mod target;

use std::fs::File;
use std::io::Read;
use std::process::exit;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use create3::{Address, Deriver, Salt};
use rarity::{Find, Scanner};
use target::Target;

const COUNTER_OFFSET: usize = 24;
const PROGRESS_EVERY: Duration = Duration::from_secs(10);
const BATCH: u64 = 4096;

struct Options {
    deployer: Address,
    target: Target,
    list_above: Option<f64>,
    threads: usize,
    derive: Option<Salt>,
}

const USAGE: &str = "usage: grinder --deployer 0x<address> [--zeros N] [--hook-mask 0x3fff] \
[--pattern hex]... [--list-above BITS] [--threads N] [--derive 0x<salt>]";

fn fail(message: &str) -> ! {
    eprintln!("{message}\n{USAGE}");
    exit(2)
}

fn parse_hex<const N: usize>(value: &str) -> [u8; N] {
    let bytes = hex::decode(value.trim_start_matches("0x")).unwrap_or_else(|_| fail("bad hex"));
    bytes.try_into().unwrap_or_else(|_| fail(&format!("expected {N} bytes")))
}

fn parse_number<T: std::str::FromStr>(value: &str) -> T {
    value.parse().unwrap_or_else(|_| fail(&format!("not a number: {value}")))
}

fn parse_pattern(value: &str) -> Vec<u8> {
    let digits: Option<Vec<u8>> = value.chars().map(|c| c.to_digit(16).map(|d| d as u8)).collect();
    digits.filter(|d| (1..=8).contains(&d.len())).unwrap_or_else(|| fail("patterns are 1-8 hex digits"))
}

fn parse_options() -> Options {
    let mut options = Options {
        deployer: [0; 20],
        target: Target::default(),
        list_above: None,
        threads: thread::available_parallelism().map_or(1, |n| n.get()),
        derive: None,
    };
    let mut has_deployer = false;
    let mut args = std::env::args().skip(1);

    while let Some(flag) = args.next() {
        let value = args.next().unwrap_or_else(|| fail(&format!("{flag} needs a value")));
        match flag.as_str() {
            "--deployer" => (options.deployer, has_deployer) = (parse_hex(&value), true),
            "--zeros" => options.target.min_zero_bytes = parse_number(&value),
            "--hook-mask" => options.target.hook_mask = Some(parse_mask(&value)),
            "--pattern" => options.target.patterns.push(parse_pattern(&value)),
            "--list-above" => options.list_above = Some(parse_number(&value)),
            "--threads" => options.threads = parse_number(&value),
            "--derive" => options.derive = Some(parse_hex(&value)),
            _ => fail(&format!("unknown flag {flag}")),
        }
    }

    if !has_deployer {
        fail("--deployer is required");
    }
    if !options.target.is_set() && options.list_above.is_none() && options.derive.is_none() {
        fail("give a target, --list-above, or both");
    }
    options
}

fn parse_mask(value: &str) -> u16 {
    let mask = u16::from_str_radix(value.trim_start_matches("0x"), 16)
        .unwrap_or_else(|_| fail("--hook-mask is hex"));
    if mask > 0x3fff {
        fail("--hook-mask fits in fourteen bits");
    }
    mask
}

fn random_salt() -> Salt {
    let mut salt = [0u8; 32];
    File::open("/dev/urandom")
        .and_then(|mut source| source.read_exact(&mut salt[..COUNTER_OFFSET]))
        .unwrap_or_else(|_| fail("cannot read /dev/urandom"));
    salt
}

fn hex0x(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}

fn json_or_null(value: Option<String>) -> String {
    value.unwrap_or_else(|| "null".to_string())
}

fn report_target(salt: &Salt, address: &Address) {
    println!(r#"{{"type":"target","salt":"{}","address":"{}"}}"#, hex0x(salt), hex0x(address));
}

fn report_find(salt: &Salt, address: &Address, find: &Find) {
    println!(
        r#"{{"type":"find","salt":"{}","address":"{}","rarityBits":{:.2},"minZeroBytes":{},"hookMask":{},"pattern":{},"word":{}}}"#,
        hex0x(salt),
        hex0x(address),
        find.bits,
        find.zero_bytes,
        json_or_null(find.hook_mask.map(|mask| mask.to_string())),
        json_or_null(find.word.map(|word| format!(r#""{}""#, word.hex))),
        json_or_null(find.word.map(|word| format!(r#""{}""#, word.english))),
    );
}

struct Shared {
    options: Options,
    scanner: Scanner,
    done: AtomicBool,
    attempts: AtomicU64,
}

/// Returns true when this attempt satisfied the target and the run should stop. A target salt is
/// never also reported as a find: listing it would claim the salt before the bounty could use it.
fn examine(shared: &Shared, salt: &Salt, address: &Address) -> bool {
    let target = &shared.options.target;
    if target.is_set() && target.matches(address) {
        report_target(salt, address);
        return true;
    }

    if let Some(threshold) = shared.options.list_above {
        let find = shared.scanner.scan(address);
        if find.bits >= threshold {
            report_find(salt, address, &find);
        }
    }
    false
}

fn grind(shared: &Shared) {
    let mut deriver = Deriver::new(&shared.options.deployer);
    let mut salt = random_salt();
    let mut counter: u64 = 0;

    while !shared.done.load(Ordering::Relaxed) {
        for _ in 0..BATCH {
            salt[COUNTER_OFFSET..].copy_from_slice(&counter.to_be_bytes());
            counter += 1;
            let address = deriver.derive(&salt);
            if examine(shared, &salt, &address) {
                shared.done.store(true, Ordering::Relaxed);
                break;
            }
        }
        shared.attempts.fetch_add(BATCH, Ordering::Relaxed);
    }
}

fn report_progress(shared: &Shared) {
    let started = Instant::now();
    while !shared.done.load(Ordering::Relaxed) {
        thread::sleep(PROGRESS_EVERY);
        let attempts = shared.attempts.load(Ordering::Relaxed);
        let rate = attempts as f64 / started.elapsed().as_secs_f64();
        eprintln!("{attempts} tried, {:.1}M/s", rate / 1e6);
    }
}

fn main() {
    let options = parse_options();

    if let Some(salt) = options.derive {
        println!("{}", hex0x(&Deriver::new(&options.deployer).derive(&salt)));
        return;
    }

    let shared = Arc::new(Shared {
        options,
        scanner: Scanner::new(),
        done: AtomicBool::new(false),
        attempts: AtomicU64::new(0),
    });

    let workers: Vec<_> = (0..shared.options.threads)
        .map(|_| {
            let shared = Arc::clone(&shared);
            thread::spawn(move || grind(&shared))
        })
        .collect();

    let progress = Arc::clone(&shared);
    thread::spawn(move || report_progress(&progress));

    for worker in workers {
        worker.join().expect("a grinding thread panicked");
    }
}
