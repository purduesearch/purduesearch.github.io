import { useRef } from "react";
import { Player } from "@lottiefiles/react-lottie-player";
import { prefersReducedMotion } from "../../../clubpm/anim/motion";

const ANIMATION_SRC = `${process.env.PUBLIC_URL ?? ""}/animations/bell-ring.json`;

export default function LottieBell({ size = 20, onComplete }) {
  const playerRef = useRef(null);

  if (prefersReducedMotion()) {
    onComplete?.();
    return null;
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
