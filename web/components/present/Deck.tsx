"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import { SLIDES } from "@/components/present/slides";

const TRANSITION_MS = 420;

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

/** Each slide fades through a blur and a slight scale, so advancing reads as a change of focus. */
function Stage({ index }: { index: number }) {
  const [shown, setShown] = useState(index);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (index === shown) return;
    setEntering(true);
    const timer = setTimeout(() => {
      setShown(index);
      setEntering(false);
    }, TRANSITION_MS / 2);
    return () => clearTimeout(timer);
  }, [index, shown]);

  return (
    <div
      className={`flex min-h-0 w-full flex-1 items-center justify-center px-6 py-10 transition-all duration-200 ease-out sm:px-16 ${
        entering ? "scale-[0.97] opacity-0 blur-md" : "scale-100 opacity-100 blur-0"
      }`}
    >
      <div className="flex w-full max-w-6xl items-center justify-center">
        {SLIDES[shown].render()}
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

      <footer className="flex items-center justify-between gap-6 px-6 py-6 sm:px-12">
        <button
          onClick={() => go(-1)}
          disabled={atStart}
          aria-label="Previous slide"
          className="rounded-full p-2 text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-30"
        >
          <CaretLeft size={20} weight="bold" />
        </button>

        <div className="flex items-center gap-2">
          {SLIDES.map((slide, position) => (
            <button
              key={slide.id}
              onClick={() => setIndex(position)}
              aria-label={`Go to slide ${position + 1}`}
              aria-current={position === index}
              className={`h-1.5 rounded-full transition-all ${
                position === index ? "w-7 bg-accent" : "w-1.5 bg-inert-edge hover:bg-accent-edge"
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => go(1)}
          disabled={atEnd}
          aria-label="Next slide"
          className="rounded-full p-2 text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-30"
        >
          <CaretRight size={20} weight="bold" />
        </button>
      </footer>
    </div>
  );
}
