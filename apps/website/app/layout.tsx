import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scope | Product Signals, Interview Intelligence, Feature Dossiers",
  description:
    "Scope turns interviews, Slack threads, Linear issues, and product telemetry into evidence-backed feature dossiers on your Mac.",
  metadataBase: new URL("https://scope.app")
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
