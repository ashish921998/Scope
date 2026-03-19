import Link from "next/link";

export default function PricingPage() {
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
          <Link className="nav-link" href="/privacy">
            Privacy
          </Link>
          <Link className="button" href="/download">
            Download
          </Link>
        </div>
      </nav>

      <section className="section-header">
        <div>
          <span className="eyebrow">Pricing</span>
          <h2>Pricing scaffold for direct sales and self-serve</h2>
        </div>
        <p>
          Keep this simple until billing is finalized. The page exists so outbound links and sales
          conversations have a stable public destination.
        </p>
      </section>

      <div className="pricing-grid">
        <article className="pricing-card">
          <h3>Starter</h3>
          <div className="price">
            $79<span>/seat</span>
          </div>
          <ul className="bullet-list">
            <li>Single-user desktop workspace</li>
            <li>Interview capture and debrief generation</li>
            <li>Markdown and JSON export</li>
          </ul>
        </article>
        <article className="pricing-card featured">
          <h3>Product Team</h3>
          <div className="price">
            $149<span>/seat</span>
          </div>
          <ul className="bullet-list">
            <li>Slack, Linear, and PostHog ingestion</li>
            <li>Evidence-backed feature dossiers</li>
            <li>Diagnostics workflow and support handoff</li>
          </ul>
        </article>
        <article className="pricing-card">
          <h3>Enterprise</h3>
          <div className="price">Custom</div>
          <ul className="bullet-list">
            <li>Security review and procurement support</li>
            <li>Integration rollout planning</li>
            <li>Volume and deployment negotiation</li>
          </ul>
        </article>
      </div>

      <footer className="footer">
        <span>Need exact packaging?</span>
        <span>Replace placeholder pricing after billing and trial logic are finalized.</span>
      </footer>
    </main>
  );
}
