import Link from "next/link";

const pillars = [
  {
    title: "Interview Copilot",
    body:
      "Capture calls, surface follow-ups in real time, and ship a seven-part debrief without leaving your Mac."
  },
  {
    title: "Signal Stream",
    body:
      "Normalize Slack, Linear, PostHog, and interview evidence into one local-first stream with confidence and traceable source anchors."
  },
  {
    title: "Feature Dossiers",
    body:
      "Turn weak intuition into a nine-section brief with citations, critic notes, exports, and deterministic ghost feature detection."
  }
];

const plans = [
  {
    name: "Starter",
    price: "$79",
    suffix: "/seat",
    points: ["Local-first desktop app", "Interview capture and debriefs", "Markdown and JSON export"]
  },
  {
    name: "Product Team",
    price: "$149",
    suffix: "/seat",
    featured: true,
    points: ["Slack, Linear, and PostHog ingestion", "Feature dossiers with citations", "Diagnostics and release support"]
  },
  {
    name: "Ops",
    price: "Custom",
    suffix: "",
    points: ["Notion, GitHub, and Jira rollout", "Support webhook integration", "Security and procurement review"]
  }
];

export default function WebsiteHome() {
  return (
    <main className="site-shell">
      <nav className="nav">
        <Link className="brand" href="/">
          <span className="brand-mark">S</span>
          <span>Scope</span>
        </Link>
        <div className="nav-links">
          <a className="nav-link" href="#product">
            Product
          </a>
          <Link className="nav-link" href="/pricing">
            Pricing
          </Link>
          <Link className="nav-link" href="/privacy">
            Privacy
          </Link>
          <Link className="button" href="/download">
            Download for macOS
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Local-first product intelligence</span>
          <h1>Signals become evidence. Evidence becomes product direction.</h1>
          <p>
            Scope is a macOS desktop app for product teams that need an evidence-backed operating
            system, not another opinion machine. Interviews, Slack, Linear, and PostHog are
            stitched into one dossier-ready workflow on your own machine.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/download">
              Get the signed DMG
            </Link>
            <Link className="button secondary" href="/pricing">
              See plans
            </Link>
          </div>
          <p className="hero-note">
            Built for direct distribution first. BYOK provider keys. macOS Keychain storage.
          </p>
        </div>

        <div className="hero-panel">
          <div className="panel-top">
            <div className="panel-cell">
              <strong>Input Surface</strong>
              <span className="panel-value">4 channels</span>
              <p>Interviews, Slack, Linear, and PostHog are normalized into one local queue.</p>
            </div>
            <div className="panel-cell">
              <strong>Output Surface</strong>
              <span className="panel-value">9 sections</span>
              <p>Every dossier section is built to carry citations and critic notes, not fluff.</p>
            </div>
          </div>
          <div className="panel-stack">
            <div className="stack-item">
              <span>Capture</span>
              <span>Mic + system audio, realtime transcript</span>
            </div>
            <div className="stack-item">
              <span>Infer</span>
              <span>Signal type, confidence, clustering, ghost features</span>
            </div>
            <div className="stack-item">
              <span>Export</span>
              <span>Markdown, JSON, Linear push, support diagnostics</span>
            </div>
          </div>
        </div>
      </section>

      <section id="product">
        <div className="section-header">
          <h2>Built for teams who need proof, not vibes</h2>
          <p>
            The architecture mirrors a serious desktop product: Electron shell, Next renderer,
            local Node service, SQLite with FTS and embeddings, provider keys in Keychain, and
            strict export controls.
          </p>
        </div>
        <div className="signal-grid">
          {pillars.map((pillar) => (
            <article className="section-card" key={pillar.title}>
              <h2>{pillar.title}</h2>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="section-header">
          <h2>Launch-ready from day one</h2>
          <p>
            The site is scaffolded to support direct DMG distribution, pricing conversations, and
            legal pages without needing a second repo or a separate deployment model.
          </p>
        </div>
        <div className="download-grid">
          <article className="download-card">
            <h3>Distribution</h3>
            <p>
              Ship a notarized macOS app first. Keep release notes, privacy text, and downloads in
              the same monorepo as the product so they do not drift.
            </p>
            <code>apps/website</code>
          </article>
          <article className="download-card">
            <h3>Operational fit</h3>
            <ul className="bullet-list">
              <li>Separate deployment target without separate repo overhead.</li>
              <li>Static export ready for Vercel, Netlify, S3, or Cloudflare Pages.</li>
              <li>Can evolve into docs, changelog, and pricing without structural rework.</li>
            </ul>
          </article>
        </div>
      </section>

      <section>
        <div className="section-header">
          <h2>Commercial model scaffold</h2>
          <p>
            Pricing is framed for a direct-sales plus self-serve motion. Replace copy later, but
            the page structure is already in place.
          </p>
        </div>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <article className={`pricing-card${plan.featured ? " featured" : ""}`} key={plan.name}>
              <h3>{plan.name}</h3>
              <div className="price">
                {plan.price}
                {plan.suffix ? <span>{plan.suffix}</span> : null}
              </div>
              <ul className="bullet-list">
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="section-header">
          <h2>Trust surface</h2>
          <p>
            Privacy and download flows are broken out as standalone pages because they need to be
            linked externally from releases, support tickets, and onboarding emails.
          </p>
        </div>
        <div className="legal-grid">
          <article className="legal-card">
            <h2>Privacy first</h2>
            <p>
              Provider keys stay in Keychain, the DB is encrypted at rest, and diagnostics can be
              previewed and redacted before sending.
            </p>
            <div className="hero-actions">
              <Link className="button secondary" href="/privacy">
                Read privacy page
              </Link>
            </div>
          </article>
          <article className="legal-card">
            <h2>Direct download</h2>
            <p>
              Use the download page for signed DMG distribution, release notes, and install checks
              without involving the App Store.
            </p>
            <div className="hero-actions">
              <Link className="button secondary" href="/download">
                Open download page
              </Link>
            </div>
          </article>
        </div>
      </section>

      <footer className="footer">
        <span>Scope</span>
        <span>Evidence-backed product intelligence for macOS.</span>
      </footer>
    </main>
  );
}
