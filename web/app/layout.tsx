import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cadence — CopilotKit × CrewAI",
  description:
    "A competitive-intelligence brief workspace built on ag-ui-crewai 0.3.0: reasoning streams, crew attribution, real interrupts, shared state and generative UI.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `dark` is what switches CopilotKit's own chat styles to their dark set.
    <html lang="en" className="dark">
      <head>
        {/* Tailwind v4 rejects @import url() in CSS, so fonts load here. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
