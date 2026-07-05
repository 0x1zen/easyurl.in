import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RollingNumberHandle {
  replay: () => void;
}

interface Props {
  target: number;
  decimals?: number;
  suffix: string;
  duration?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TILE_H = 54; // px — height of every digit tile and each box
// 11 tiles: 0-9 then a repeated 0 so the strip wraps visually from 9 back to 0
const TILES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

// Smooth Hermite interpolation — used to remove fractional wheel position at rest
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function checkReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// ── Layout builder ────────────────────────────────────────────────────────────

type LayoutItem =
  | { kind: "digit"; place: number }
  | { kind: "sep"; char: string };

/**
 * Produces the ordered sequence of digit boxes and separators (commas, decimal
 * point) to render for `scaledTarget` with `decimals` fractional digits.
 *
 * Place index 0 = ones of the scaled integer (= 10^-decimals place in the real
 * number), increasing leftward — matching the animation loop's convention.
 */
function buildLayout(
  numDigits: number,
  decimals: number,
  intLen: number
): LayoutItem[] {
  const layout: LayoutItem[] = [];

  // Integer digits, high place → low place
  for (let intPos = 0; intPos < intLen; intPos++) {
    const place = numDigits - 1 - intPos;
    // Insert comma every 3 digits from the right edge of the integer part
    if (intPos > 0 && (intLen - intPos) % 3 === 0) {
      layout.push({ kind: "sep", char: "," });
    }
    layout.push({ kind: "digit", place });
  }

  // Decimal point + fractional digits
  if (decimals > 0) {
    layout.push({ kind: "sep", char: "." });
    for (let d = decimals - 1; d >= 0; d--) {
      layout.push({ kind: "digit", place: d });
    }
  }

  return layout;
}

// ── Component ─────────────────────────────────────────────────────────────────

const RollingNumber = forwardRef<RollingNumberHandle, Props>(
  function RollingNumber(
    { target, decimals = 0, suffix, duration = 2000 },
    ref
  ) {
    const reduced = checkReducedMotion();

    // Work entirely in the scaled integer domain so digit-place maths stay clean.
    // e.g. target=99.9, decimals=1 → scaledTarget=999
    const scaledTarget = Math.round(target * Math.pow(10, decimals));

    // Number of digit boxes we need: at least (decimals+1) to show a leading zero
    const numDigits = Math.max(
      scaledTarget === 0
        ? 1
        : Math.floor(Math.log10(Math.max(scaledTarget, 1))) + 1,
      decimals + 1
    );
    const intLen = numDigits - decimals;

    const layout = buildLayout(numDigits, decimals, intLen);

    // stripRefs[place] → the <div> element for that digit wheel
    const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
    // Holds the cancelAnimationFrame call for any in-progress animation
    const cancelRef = useRef<() => void>(() => {});

    const startAnimation = useCallback(() => {
      // Cancel any previous run
      cancelRef.current();

      if (reduced) {
        // Snap immediately to final digits without animating
        stripRefs.current.forEach((strip, place) => {
          if (!strip) return;
          const digit = Math.floor(scaledTarget / Math.pow(10, place)) % 10;
          strip.style.transform = `translateY(${-digit * TILE_H}px)`;
        });
        return;
      }

      let startTime: number | null = null;
      let rafId: number;

      function tick(now: number): void {
        if (startTime === null) startTime = now;
        const elapsed = now - startTime;
        const p = Math.min(elapsed / duration, 1);
        const easedP = easeOutCubic(p);
        const scaledValue = scaledTarget * easedP;

        stripRefs.current.forEach((strip, place) => {
          if (!strip) return;
          const denom = Math.pow(10, place);
          // Fractional position in [0, 10) for this wheel
          const raw = (scaledValue / denom) % 10;

          // Over the last 20 % of the run, ease the fractional carry to zero so
          // every wheel lands exactly on an integer rather than stopping mid-tile.
          const tSnap = Math.max(0, Math.min((p - 0.8) / 0.2, 1));
          const snap = smoothstep(tSnap);
          const pos = raw - (raw - Math.floor(raw)) * snap;

          strip.style.transform = `translateY(${-pos * TILE_H}px)`;
        });

        if (p < 1) {
          rafId = requestAnimationFrame(tick);
        }
      }

      rafId = requestAnimationFrame(tick);
      cancelRef.current = () => cancelAnimationFrame(rafId);
    }, [scaledTarget, duration, reduced]);

    // Restart whenever the target or timing changes
    useEffect(() => {
      startAnimation();
      return () => cancelRef.current();
    }, [startAnimation]);

    // Let parent components call replay() via a ref
    useImperativeHandle(ref, () => ({ replay: startAnimation }), [
      startAnimation,
    ]);

    // ── Reduced-motion fallback — plain formatted text ─────────────────────
    if (reduced) {
      const formatted =
        decimals > 0
          ? target.toLocaleString("en", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })
          : target.toLocaleString("en");
      return (
        <span className="rolling-number rolling-number--static">
          <span className="rolling-number-static-val">{formatted}</span>
          <span className="rolling-number-suffix">{suffix}</span>
        </span>
      );
    }

    // ── Animated odometer ─────────────────────────────────────────────────
    return (
      <span className="rolling-number">
        <span className="rolling-number-boxes">
          {layout.map((item, i) =>
            item.kind === "sep" ? (
              <span key={i} className="rolling-number-sep">
                {item.char}
              </span>
            ) : (
              <span key={i} className="rolling-number-box">
                <div
                  ref={(el) => {
                    stripRefs.current[item.place] = el;
                  }}
                  className="rolling-number-strip"
                >
                  {TILES.map((digit, ti) => (
                    <span key={ti} className="rolling-number-tile">
                      {digit}
                    </span>
                  ))}
                </div>
              </span>
            )
          )}
        </span>
        <span className="rolling-number-suffix">{suffix}</span>
      </span>
    );
  }
);

export default RollingNumber;
