export default function AppsPage() {
  return (
    <div className="shell">
      <nav>
        <a className="brand" href="/"><img src="/mark.jpg" alt="" />Held</a>
        <div className="nav-links">
          <a href="/">Mint</a>
          <a href="/apps">For apps</a>
        </div>
      </nav>

      <header className="apps-hero">
        <p className="kicker">For apps</p>
        <h1>Ask the check from the method you want to protect.</h1>
        <p className="lede">The page can open the captcha. The payment, claim, or vote still has to ask Held. A button that only checks in the browser can be skipped.</p>
      </header>

      <ol className="guide apps-steps">
        <li>
          <em>01</em>
          <strong>Read</strong>
          <span>Before the user signs, ask if this account is inside the minute. If it is, continue. If it is not, open Held.</span>
        </li>
        <li>
          <em>02</em>
          <strong>Captcha</strong>
          <span>Held runs the camera in the user’s browser. The hand does not go on the chain. The check stores when the captcha was done.</span>
        </li>
        <li>
          <em>03</em>
          <strong>Ask again</strong>
          <span>Your contract calls the check, then does the work. The coin at coin.held141126.testnet is the example.</span>
        </li>
      </ol>

      <section className="snippet">
        <h2>In the browser</h2>
        <pre>{`import { ensureFresh } from "held/sdk";

await ensureFresh(account);
// then the user signs your method`}</pre>
      </section>

      <section className="snippet">
        <h2>In the contract</h2>
        <pre>{`Promise::new("held141126.testnet".parse().unwrap()).function_call(
    "is_fresh".to_string(),
    json!({ "account": caller, "max_age_ms": 60_000 }).to_string().into_bytes(),
    NearToken::from_yoctonear(0),
    Gas::from_tgas(10),
).then(
    Self::ext(env::current_account_id())
        .with_static_gas(Gas::from_tgas(20))
        .on_claim(caller),
);`}</pre>
        <p><code>60_000</code> is this coin’s window, not a rule of the captcha. Pass the window your app wants. The full paste is in <code>sdk/check.rs</code>.</p>
      </section>

      <footer>
        <div>
          <span>Check</span>
          <code>held141126.testnet</code>
        </div>
        <div>
          <span>Example coin</span>
          <code>coin.held141126.testnet</code>
        </div>
      </footer>
    </div>
  );
}
