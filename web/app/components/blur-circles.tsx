/** Background depth.
 *
 * Six lavender/white ellipses do not survive on #010507 — white washes turn the
 * surface grey and lose the point of a dark context. Same idea, retuned per
 * theme: a few accent glows at an opacity where they read as depth rather than
 * as colour. The alpha cannot be shared between themes, because a wash that is
 * barely there on near-black is nothing at all on white — so the colours are
 * tokens and each theme sets its own (see globals.css).
 */
export function BlurCircles() {
  const glows = [
    { width: 620, height: 620, left: -180, top: -220, color: "var(--glow-lilac-strong)" },
    { width: 520, height: 520, left: 780, top: -260, color: "var(--glow-mint)" },
    { width: 700, height: 700, left: 420, top: 520, color: "var(--glow-lilac-soft)" },
    { width: 460, height: 460, left: 1180, top: 640, color: "var(--glow-orange)" },
  ];

  return (
    <>
      {glows.map((glow, index) => (
        <div
          key={index}
          aria-hidden
          style={{
            position: "absolute",
            width: glow.width,
            height: glow.height,
            left: glow.left,
            top: glow.top,
            borderRadius: "50%",
            background: glow.color,
            filter: "blur(120px)",
            zIndex: 0,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}
