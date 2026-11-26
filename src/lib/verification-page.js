const { createHash } = require('node:crypto');

const styles = `
  :root {
    color-scheme: dark;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #f3f6ff;
    background: #080b13;
  }

  * { box-sizing: border-box; }

  body {
    min-height: 100svh;
    margin: 0;
    display: grid;
    place-items: center;
    padding: 22px;
    background:
      radial-gradient(ellipse at 16% 6%, #182656 0%, transparent 48%),
      radial-gradient(ellipse at 90% 92%, #142528 0%, transparent 42%),
      #080b13;
  }

  main { width: min(100%, 510px); }

  .brand {
    margin: 0 0 15px;
    color: #dfe6f7;
    font-size: .875rem;
    font-weight: 700;
    letter-spacing: .02em;
  }

  .card {
    border: 1px solid #303b55;
    border-radius: 26px;
    padding: clamp(16px, 5vw, 36px);
    background: linear-gradient(150deg, #171d2e 0%, #111522 75%);
    box-shadow: 0 26px 76px #02040bb3, inset 0 1px 0 #ffffff12;
  }

  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    padding: 0;
    margin: 0 0 26px;
    list-style: none;
    font-size: .77rem;
    font-weight: 650;
    color: #b7c5e8;
  }

  .steps li { display: flex; align-items: center; gap: 7px; }
  .steps li[aria-current="step"] { color: #e0e6ff; }

  .marker {
    display: grid;
    place-items: center;
    width: 21px;
    height: 21px;
    flex: none;
    border-radius: 50%;
    background: #203832;
    color: #a4efd2;
    font-size: .72rem;
    font-weight: 800;
  }

  [aria-current="step"] .marker { background: #344177; color: #f0f3ff; }

  h1 {
    margin: 0;
    max-width: 15ch;
    font-size: clamp(1.8rem, 7vw, 2.65rem);
    line-height: 1.08;
    letter-spacing: -.045em;
  }

  .description {
    margin: 14px 0 24px;
    max-width: 38ch;
    color: #bfcae2;
    font-size: .96rem;
    line-height: 1.55;
  }

  form { display: grid; gap: 16px; }

  .widget {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 154px;
    border: 1px solid #2e3951;
    border-radius: 13px;
    padding: 8px;
    background: #0b101b;
  }

  .primary {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 49px;
    border: 1px solid #a7b8ff;
    border-radius: 12px;
    padding: 10px 14px;
    background: #a7b8ff;
    color: #101833;
    font: inherit;
    font-weight: 750;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }

  .primary:hover { background: #c3ceff; }
  .primary:focus-visible { outline: 3px solid #c5d4ff; outline-offset: 4px; }

  .hint {
    margin: 17px 0 0;
    color: #aab7d2;
    font-size: .8rem;
    line-height: 1.5;
  }

  .success { color: #a4efd2; }
`;

const styleHash = createHash('sha256').update(styles).digest('base64');
const discordLink = '<a class="primary" href="https://discord.com/channels/@me">Return to Discord</a>';

function layout(title, description, content, steps = '') {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} · Obskyra</title>
    <style>${styles}</style>
  </head>
  <body>
    <main>
      <p class="brand">Obskyra’s Basement</p>
      <section class="card" aria-labelledby="page-title">
        ${steps}
        <h1 id="page-title">${title}</h1>
        <p class="description">${description}</p>
        ${content}
      </section>
    </main>
  </body>
</html>`;
}

function challengePage(sitekey, action, id) {
  const steps = `<ol class="steps" aria-label="Verification steps">
    <li><span class="marker" aria-hidden="true">✓</span>Image CAPTCHA passed</li>
    <li aria-current="step"><span class="marker" aria-hidden="true">2</span>Cloudflare check</li>
  </ol>`;
  const widget = `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" defer></script>
    <form method="post">
      <div class="widget">
        <div class="cf-turnstile" data-sitekey="${sitekey}" data-action="${action}" data-cdata="${id}"
          data-theme="dark" data-size="compact"></div>
      </div>
      <button class="primary" type="submit">Finish verification</button>
    </form>
    <p class="hint">This private link expires five minutes after it was issued.</p>`;
  return layout(
    'Finish verification',
    'Complete the Cloudflare check to unlock the rest of the Discord server.',
    widget,
    steps,
  );
}

function resultPage(status, message, retry) {
  if (status === 200) {
    const steps = '<p class="steps success">✓ Both checks passed</p>';
    return layout('You’re verified', 'Your member role is ready. Head back to Discord to join in.', discordLink, steps);
  }
  const button = retry ? '<a class="primary" href="">Try again</a>' : discordLink;
  const title = status === 410 ? 'This link has expired' : 'Verification paused';
  return layout(title, message, button);
}

module.exports = { challengePage, resultPage, styleHash };
