"use client";

import { Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { RequestDialog } from "@/components/RequestDialog";
import { WalletMenu } from "@/components/WalletMenu";
import { Button } from "@/components/ui";

const NAV = [
  { href: "/market", label: "Browse" },
  { href: "/sealed", label: "Sealed" },
] as const;

/**
 * Shared by the market and the account pages. Anything passed as children rides in the same
 * sticky bar, which is how the market keeps its filters in reach while the grid scrolls under
 * them. On a phone a bar that tall would cover half the screen, so there it scrolls away instead.
 */
export function SiteHeader({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const [requesting, setRequesting] = useState(false);
  const stickiness = children === undefined ? "sticky top-0" : "sm:sticky sm:top-0";

  return (
    <>
      <header className={`${stickiness} z-20 border-b border-edge bg-surface-raised`}>
        <div className="flex items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-extrabold text-text">
              Maras
            </Link>
            <nav aria-label="Market" className="flex items-center gap-5">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="rounded-[var(--radius-control)] text-sm font-medium text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=page]:text-text"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => setRequesting(true)}>
              <Plus size={16} aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Request an address</span>
            </Button>
            <WalletMenu />
          </div>
        </div>

        {children !== undefined && <div className="px-5 pb-4 sm:px-8">{children}</div>}
      </header>

      {requesting && <RequestDialog onClose={() => setRequesting(false)} />}
    </>
  );
}
