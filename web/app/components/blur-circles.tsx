/** Background depth for the dark surface.
 *
 * The light theme's six lavender/white ellipses do not survive on #010507 — white
 * washes turn the surface grey and lose the point of a dark context. Same idea,
 * rendered for dark: a few very low-opacity accent glows, all from verified
 * tokens, at an opacity where they read as depth rather than as colour.
 */
export function BlurCircles() {
  const glows = [
    { width: 620, height: 620, left: -180, top: -220, color: "rgba(190, 194, 255, 0.055)" },
    { width: 520, height: 520, left: 780, top: -260, color: "rgba(133, 236, 206, 0.04)" },
    { width: 700, height: 700, left: 420, top: 520, color: "rgba(190, 194, 255, 0.03)" },
    { width: 460, height: 460, left: 1180, top: 640, color: "rgba(255, 172, 77, 0.035)" },
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
