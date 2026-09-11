"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import { SLIDES } from "@/components/present/slides";

function useSlideIndex(total: number) {
  const [index, setIndex] = useState(0);

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => Math.min(total - 1, Math.max(0, current + delta)));
    },
    [total],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const forward = ["ArrowRight", "ArrowDown", " ", "PageDown"];
      const back = ["ArrowLeft", "ArrowUp", "PageUp"];
      if (forward.includes(event.key)) {
        event.preventDefault();
        go(1);
      }
      if (back.includes(event.key)) {
        event.preventDefault();
        go(-1);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return { index, go, setIndex };
}

/**
 * Keyed on the index so React remounts it, which lets one CSS animation play on entry. Driving
 * the fade from state needed a timer to undo itself, and when that undo did not land the slide
 * stayed invisible — a blank screen is a worse failure than an abrupt cut.
 */
function Stage({ index }: { index: number }) {
  return (
    <div
      key={index}
      className="slide-enter flex min-h-0 w-full flex-1 items-center justify-center px-6 py-10 sm:px-16"
    >
      <div className="flex w-full max-w-6xl items-center justify-center">
        {SLIDES[index].render()}
      </div>
    </div>
  );
}

export function Deck() {
  const { index, go, setIndex } = useSlideIndex(SLIDES.length);
  const atStart = index === 0;
  const atEnd = index === SLIDES.length - 1;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Stage index={index} />

      <footer className="flex shrink-0 items-center justify-between gap-6 px-8 py-8 sm:px-12">
        <button
          onClick={() => go(-1)}
          disabled={atStart}
          aria-label="Previous slide"
          className="rounded-full bg-surface-raised p-3 text-text-muted shadow-[var(--shadow-card)] transition-colors hover:text-text disabled:opacity-25"
        >
          <CaretLeft size={24} weight="bold" />
        </button>

        <div className="flex items-center gap-2.5">
          {SLIDES.map((slide, position) => (
            <button
              key={slide.id}
              onClick={() => setIndex(position)}
              aria-label={`Go to slide ${position + 1}`}
              aria-current={position === index}
              className={`h-2.5 rounded-full transition-all ${
                position === index ? "w-10 bg-accent" : "w-2.5 bg-inert-edge hover:bg-accent-edge"
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => go(1)}
          disabled={atEnd}
          aria-label="Next slide"
          className="rounded-full bg-surface-raised p-3 text-text-muted shadow-[var(--shadow-card)] transition-colors hover:text-text disabled:opacity-25"
        >
          <CaretRight size={24} weight="bold" />
        </button>
      </footer>
    </div>
  );
}
