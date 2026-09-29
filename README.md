# iValidate

A single-screen email validator with a Node.js backend. The browser sends an email address to `POST /api/validate`; only the server authenticates with EmailValidation.io. Sample reports work without an API key.

## Run locally

Requires Node.js 22 or newer. No npm dependencies are needed.

1. Copy `.env.example` to `.env` if `.env` does not already exist.
2. Revoke the previously exposed key in your EmailValidation account and create a replacement. Put it in `.env`:

   ```dotenv
   EMAILVALIDATION_API_KEY=your_new_key
   HOST=127.0.0.1
   PORT=4173
   ```

3. Run `npm start` and open http://127.0.0.1:4173.

Restart the server after changing `.env`. Do not open `index.html` directly or use a generic static server for live validation. If the key is missing, the UI explains that live validation is not configured; the sample still works.

## Key handling

- `.env` and other environment files are ignored by Git; `.env.example` contains no secret.
- The server uses the provider’s `apikey` header, never a browser-visible key or key in a URL. See [provider authentication documentation](https://emailvalidation.io/docs/authentication).
- Static serving uses an explicit public-file allowlist. `.env`, Git data, tests, and server source cannot be downloaded through this server.
- Errors are sanitized and results are not cached. Email addresses and keys are not logged by the application.
- Removing a key from current source does not revoke it or erase earlier Git history. Replace the old key through your provider account.

## Checks

Run `npm test`. Tests use a fake provider and do not consume API credits. They cover public asset isolation, secret removal, input validation, header authentication, response filtering, missing configuration, upstream errors, timeouts, and rate limits.

## Deployment

Deploy as a Node application, not a static site. Set `EMAILVALIDATION_API_KEY` in the hosting provider’s secret/environment settings, set `HOST=0.0.0.0` where required, and use the supplied `PORT`. Start with `npm start` behind HTTPS.

The included limit is 20 attempts per minute per socket IP, in memory. It resets on restart; behind a proxy it may be shared by visitors. It does not trust forwarded IP headers. For a public deployment, configure platform-level quota controls and abuse protection; hiding the key alone does not prevent visitors from calling the public validation endpoint. Multi-instance deployments need a shared limiter.
