import { useEffect, useRef } from "react";
import { Player } from "@lottiefiles/react-lottie-player";
import { prefersReducedMotion } from "../../../clubpm/anim/motion";

const ANIMATION_SRC = `${process.env.PUBLIC_URL ?? ""}/animations/task-check.json`;

export default function LottieCheck({ size = 24, onComplete }) {
  const playerRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      onComplete?.();
      return;
    }
    // Safety net: even if the Lottie load fails silently, release the
    // playing-overlay state so the static check returns. ~900ms matches the
    // expected animation length.
    const fallback = setTimeout(() => onComplete?.(), 1100);
    return () => clearTimeout(fallback);
  }, [onComplete]);

  if (prefersReducedMotion()) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
        }}
      >
        <i className="fas fa-check" aria-hidden="true" style={{ fontSize: size * 0.75 }} />
      </span>
    );
  }

  return (
    <Player
      ref={playerRef}
      src={ANIMATION_SRC}
      autoplay
      keepLastFrame
      style={{ width: size, height: size, pointerEvents: "none" }}
      onEvent={(ev) => { if (ev === "complete") onComplete?.(); }}
    />
  );
}
