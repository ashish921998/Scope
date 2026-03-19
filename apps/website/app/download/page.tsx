import Link from "next/link";

export default function DownloadPage() {
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
          <Link className="nav-link" href="/privacy">
            Privacy
          </Link>
        </div>
      </nav>

      <section className="section-header">
        <div>
          <span className="eyebrow">Download</span>
          <h2>Signed DMG distribution scaffold</h2>
        </div>
        <p>
          Replace the placeholder links once your first notarized macOS build is published. The
          point of this page is to give release and support flows a stable public URL now.
        </p>
      </section>

      <div className="download-grid">
        <article className="download-card">
          <h3>Current release</h3>
          <p>Scope for macOS 0.1.0</p>
          <div className="hero-actions">
            <a className="button" href="https://example.com/scope-latest.dmg">
              Download DMG
            </a>
            <a className="button secondary" href="https://example.com/scope-release-notes">
              Release notes
            </a>
          </div>
        </article>

        <article className="download-card">
          <h3>Before install</h3>
          <ul className="bullet-list">
            <li>macOS 14 or later recommended.</li>
            <li>First launch may prompt for microphone and Keychain access.</li>
            <li>Set provider credentials before starting realtime transcription.</li>
          </ul>
        </article>

        <article className="download-card">
          <h3>Install validation</h3>
          <ul className="bullet-list">
            <li>App boots cleanly.</li>
            <li>Local service responds to health checks.</li>
            <li>Encrypted DB initializes successfully.</li>
            <li>Diagnostics preview and send workflow are available.</li>
          </ul>
        </article>

        <article className="download-card">
          <h3>Support path</h3>
          <p>
            If something fails after install, use the in-app diagnostics sender so logs and a
            redacted health snapshot can be routed to support.
          </p>
        </article>
      </div>

      <footer className="footer">
        <span>Release handoff</span>
        <span>Swap placeholder URLs once the notarized DMG pipeline is producing artifacts.</span>
      </footer>
    </main>
  );
}
