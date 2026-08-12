/** The six signature CopilotCloud background ellipses.
 *
 * The parent must be `position: relative; overflow: hidden`, and every content
 * card must sit at zIndex 1 so it renders above these.
 */
export function BlurCircles() {
  const circles = [
    { width: 446, height: 446, left: 1040, top: 11, background: "rgba(255, 172, 77, 0.2)" },
    { width: 609, height: 609, left: 1339, top: 625, background: "#C9C9DA" },
    { width: 609, height: 609, left: 670, top: -365, background: "#C9C9DA" },
    { width: 609, height: 609, left: 508, top: 702, background: "#F3F3FC" },
    { width: 446, height: 446, left: 128, top: 331, background: "rgba(255, 243, 136, 0.3)" },
    { width: 446, height: 446, left: -205, top: 803, background: "rgba(255, 172, 77, 0.2)" },
  ];

  return (
    <>
      {circles.map((circle, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            borderRadius: "50%",
            filter: "blur(103px)",
            zIndex: 0,
            ...circle,
          }}
        />
      ))}
    </>
  );
}
