import { Marketplace } from "@/components/Marketplace";
import { MARAS_ADDRESS } from "@/lib/maras.generated";

function Footer() {
  return (
    <footer className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-edge px-4 py-6 text-xs text-text-subtle sm:px-6 lg:px-10">
      <span>Base Sepolia</span>
      {MARAS_ADDRESS !== null && (
        <a
          className="hex text-text-muted hover:text-text"
          href={`https://sepolia.basescan.org/address/${MARAS_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
        >
          {MARAS_ADDRESS}
        </a>
      )}
      <a
        className="text-text-muted hover:text-text"
        href="https://github.com/borisnezlobin/maras"
        target="_blank"
        rel="noreferrer"
      >
        Source
      </a>
    </footer>
  );
}

export default function Page() {
  return (
    <>
      <Marketplace />
      <Footer />
    </>
  );
}
