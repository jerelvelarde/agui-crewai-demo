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
    // `dark` is what switches CopilotKit's own chat styles to their dark set,
    // and what our own light tokens key off. It ships on, because dark is the
    // default; the script below is the only thing that ever takes it away.
    // suppressHydrationWarning is required, not decorative: the script below
    // removes this class before React hydrates, so the server's "dark" and the
    // client's "" genuinely disagree on this one element. Without it React
    // treats that as a real mismatch, discards the server tree and re-renders
    // the whole root — which drops any click made in that window. Scoped to
    // <html>; children still get full hydration checking.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Applies a stored light choice before first paint. Without this the
            page would render dark and then flip, which is worse than either
            theme. Inline and synchronous on purpose — deferring it is the bug. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('cadence-theme')==='light')" +
              "document.documentElement.classList.remove('dark')}catch(e){}",
          }}
        />
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
