import { Launch } from "@/components/launch";

const guide = [
  ["Mint", "One button. The coin asks the check. A fresh account pays. An account without a pass goes to the three poses."],
  ["Hold", "The camera opens. Hold each pose it names. Draw again replaces the set."],
  ["Pay", "After the holds, Meteor asks you to confirm the mint. That transaction is yours. The two pose transactions are paid by the relayer."],
];

export default function Home() {
  return (
    <div className="shell">
      <nav>
        <a className="brand" href="#top"><img src="/mark.jpg" alt="" />Held</a>
        <a href="#mint">Mint</a>
      </nav>

      <header className="hero" id="top">
        <div>
          <p className="kicker">NEAR testnet</p>
          <h1>Mint. The coin asks first.</h1>
          <p className="lede">One button. If this account already held the poses, the coin pays. If it has not, you hold three poses, then the same mint continues.</p>
        </div>
        <section className="desk" id="mint" aria-label="Mint">
          <Launch />
        </section>
      </header>

      <ol className="guide">
        {guide.map(([title, body], index) => (
          <li key={title}>
            <em>{String(index + 1).padStart(2, "0")}</em>
            <strong>{title}</strong>
            <span>{body}</span>
          </li>
        ))}
      </ol>

      <section className="pass">
        <h2>A fresh account skips the camera.</h2>
        <div>
          <p>The first check is a free read, so the page knows which button to show. If the pass is still inside its minute, there is nothing to film.</p>
          <p>The last check happens inside the coin, after you sign mint. A script can ignore this page and call the coin directly. The coin still asks the check, and it refuses when the answer is no.</p>
        </div>
      </section>

      <section className="wallet">
        <div>
          <h2>Use Meteor.</h2>
          <p>NEAR Connect loads wallet code in a sandbox, from the official list, instead of shipping those wallets inside this site. Meteor is the one on that list that still creates a testnet account. Create it, request testnet NEAR from Meteor’s faucet, then come back and connect.</p>
        </div>
        <div className="wallet-links">
          <a href="https://wallet.meteorwallet.app" target="_blank" rel="noreferrer">Open Meteor</a>
          <a href="https://chromewebstore.google.com/detail/meteor-wallet/pcndjhkinnkaohffealmlmhaepkpmgkb" target="_blank" rel="noreferrer">Chrome extension</a>
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
