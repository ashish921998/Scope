import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Scope",
  description: "Evidence-backed product intelligence desktop app"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
