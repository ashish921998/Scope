import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="site-shell">
      <nav className="nav">
        <Link className="brand" href="/">
          <span className="brand-mark">S</span>
          <span>Scope</span>
        </Link>
        <div className="nav-links">
          <Link className="nav-link" href="/">
            Home
          </Link>
          <Link className="nav-link" href="/pricing">
            Pricing
          </Link>
          <Link className="button" href="/download">
            Download
          </Link>
        </div>
      </nav>

      <section className="section-header">
        <div>
          <span className="eyebrow">Privacy</span>
          <h2>Scope keeps product evidence local by default</h2>
        </div>
        <p>
          This is launch-page privacy copy, not final counsel-reviewed text. It exists so the
          product site can truthfully describe current implementation choices.
        </p>
      </section>

      <div className="legal-grid">
        <article className="legal-card">
          <h2>Storage</h2>
          <ul className="bullet-list">
            <li>Provider API keys and OAuth tokens are stored in macOS Keychain.</li>
            <li>Local application data is stored in an encrypted SQLite database.</li>
            <li>The app is designed for single-user local-first operation in the initial release.</li>
          </ul>
        </article>
        <article className="legal-card">
          <h2>Data flow</h2>
          <ul className="bullet-list">
            <li>Interviews, Slack, Linear, and PostHog data are normalized into local records.</li>
            <li>Exports happen only when a user explicitly initiates them.</li>
            <li>Diagnostics can be previewed, selectively included, and redacted before sending.</li>
          </ul>
        </article>
        <article className="legal-card">
          <h2>Network controls</h2>
          <ul className="bullet-list">
            <li>Network egress is constrained to provider and integration domains.</li>
            <li>OAuth flows use a loopback callback on `127.0.0.1`.</li>
            <li>Webhook diagnostics support authenticated and signed delivery.</li>
          </ul>
        </article>
        <article className="legal-card">
          <h2>What still needs counsel review</h2>
          <ul className="bullet-list">
            <li>Final recording consent text.</li>
            <li>Retention language for incoming support bundles.</li>
            <li>Jurisdiction-specific disclosures and processor lists.</li>
          </ul>
        </article>
      </div>

      <footer className="footer">
        <span>Privacy copy status</span>
        <span>Accurate to the current codebase, but not yet a final legal document.</span>
      </footer>
    </main>
  );
}
