import { Launch } from "@/components/launch";

const points = [
  ["The app chooses", "There is no universal expiry. The contract that asks passes its own window, the way GestureGate does."],
  ["Once here", "This coin pays once for a captcha. Another coin from this app needs a new captcha. Other apps are not spent by that mint."],
  ["The coin asks", "The mint calls the check itself. Skipping this page does not skip the question."],
];

export default function Home() {
  return (
    <div className="shell">
      <nav>
        <a className="brand" href="/"><img src="/mark.jpg" alt="" />Held</a>
        <div className="nav-links">
          <a href="/">Mint</a>
          <a href="/apps">For apps</a>
        </div>
      </nav>

      <header className="hero" id="top">
        <div>
          <p className="kicker">NEAR testnet</p>
          <h1>Mint. The coin asks first.</h1>
          <p className="lede">A captcha other apps can reuse. Each app chooses how recent it must be. This coin asks for the last minute, and pays once per captcha.</p>
        </div>
        <section className="desk" id="mint" aria-label="Mint">
          <Launch />
        </section>
      </header>

      <ol className="guide">
        {points.map(([title, body]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{body}</span>
          </li>
        ))}
      </ol>

      <section className="pass">
        <h2>Same check, any app.</h2>
        <div>
          <p>The gestures stay on this device. The server sees the pose name, the time, and a confidence score. The chain stores the account and the minute.</p>
          <p>Another app calls that minute from its own method, then does its own work. The setup is on <a href="/apps">For apps</a>.</p>
        </div>
      </section>

      <footer>
        <div>
          <span>Check</span>
          <code>held141126.testnet</code>
        </div>
        <div>
          <span>Coin</span>
          <code>coin.held141126.testnet</code>
        </div>
      </footer>
    </div>
  );
}
