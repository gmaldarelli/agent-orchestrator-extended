# Agent Guide: Backend

This directory contains the Pune Reads API backend. It is a Vercel serverless app: every file in `api/` becomes an HTTP endpoint. There is no Express server, no long-running process, and currently no package manifest or install step.

## Scope

- Backend root: `saturday-reads-api/`
- Endpoint files: `api/*.js`
- Vercel config: `vercel.json`
- User docs: `README.md`
- Frontend directory: `../saturday-reads/`

Do not edit the frontend from this directory unless the task explicitly spans both apps.

## Endpoint Map

- `api/verify-password.js`
  - `POST /api/verify-password`
  - Validates `x-site-password` when `SITE_PASSWORD` is configured.
  - Requires `body.name`.
- `api/generate-caption.js`
  - `POST /api/generate-caption`
  - Validates images, builds a caption prompt, and calls Groq's OpenAI-compatible chat completions API.
  - Uses `LLM_API_KEY`.
- `api/cloudinary-sign.js`
  - `POST /api/cloudinary-sign`
  - Returns a short-lived Cloudinary signed upload payload.
  - Uses `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
- `api/publish-to-instagram.js`
  - `POST /api/publish-to-instagram`
  - Creates Instagram media containers, waits for processing, and publishes single-image or carousel posts.
  - Uses `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_ACCOUNT_ID`.
- `api/health-check.js`
  - `POST /api/health-check`
  - Lightweight liveness endpoint.

## Environment Variables

Required for production behavior:

```env
LLM_API_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=
```

Optional but recommended:

```env
SITE_PASSWORD=
ALLOWED_ORIGIN=
```

Rules for agents:

- Never commit `.env` or real secrets.
- Keep secrets server-side. The frontend may receive Cloudinary `apiKey`, but never `CLOUDINARY_API_SECRET`.
- If adding a protected endpoint, require `x-site-password` when `SITE_PASSWORD` is set.
- If adding a browser-called endpoint, include CORS headers and handle `OPTIONS`.

## Backend Contracts Used By Frontend

The frontend in `../saturday-reads/index.html` expects:

- All protected endpoints accept `x-site-password`.
- `POST /api/verify-password` returns `{ ok: true, name }` on success.
- `POST /api/generate-caption` accepts:

```json
{
  "images": ["<raw_base64_without_data_url_prefix>"],
  "context": {
    "books": ["Book title"],
    "date": "2026-04-03",
    "notes": "Optional notes"
  }
}
```

- `POST /api/generate-caption` returns `{ "caption": "..." }`.
- `POST /api/cloudinary-sign` returns `{ signature, timestamp, cloudName, apiKey }`.
- `POST /api/publish-to-instagram` accepts `{ imageUrls, caption }` and returns `{ success, postId }`.

Update the frontend and frontend agent guide if these contracts change.

## Local Development

Use Vercel's local runtime:

```bash
npx vercel dev
```

Default local URL is usually `http://localhost:3000`. The frontend `PROXY_URL` must point at this URL for local integration testing.

There is no `package.json` at the moment. If you add dependencies, add a package manifest and document the install/test commands here and in `README.md`.

## Testing

There is one test file, `api/publish-to-instagram.test.mjs`. Run it with Node:

```bash
node api/publish-to-instagram.test.mjs
```

For endpoint smoke tests while `vercel dev` is running:

```bash
curl -i -X POST http://localhost:3000/api/health-check
curl -i -X POST http://localhost:3000/api/verify-password \
  -H 'Content-Type: application/json' \
  -H 'x-site-password: <password>' \
  --data '{"name":"Agent"}'
```

Avoid testing real Instagram publishing unless the user explicitly asks and confirms the target account and media.

## Editing Guidelines

- Keep each endpoint self-contained. Vercel routes by file path.
- Set CORS headers before method checks so preflight responses work.
- Keep method checks explicit and return `405` for unsupported methods.
- Return structured JSON errors with stable `error` fields; frontend status messages often surface these.
- Preserve the `OPTIONS` handling pattern for browser-called endpoints.
- Use Node 18+ built-ins where practical. Current code relies on global `fetch` and `crypto`.
- Keep `vercel.json` timeouts aligned with endpoint behavior:
  - Caption generation can be slower.
  - Instagram carousel publishing can be much slower because it polls container status.
- Do not log secrets. Log upstream error payloads only when they do not include credentials.

## Common Tasks

- Add a new endpoint:
  - Create `api/<route>.js`.
  - Export `default function handler(req, res)` or `default async function handler(req, res)`.
  - Add CORS and `OPTIONS` handling if called from the browser.
  - Add a `vercel.json` function entry if it needs custom memory or timeout.
  - Update frontend helpers if the browser should call it.
- Change the Groq model or prompt:
  - Edit `api/generate-caption.js`.
  - Smoke test with a small base64 image payload.
  - Keep response shape compatible with the frontend.
- Change Cloudinary upload signing:
  - Edit `api/cloudinary-sign.js`.
  - Keep the API secret server-side.
  - Coordinate any browser `FormData` changes in `uploadToCloudinary()`.
- Change Instagram publishing:
  - Edit `api/publish-to-instagram.js`.
  - Maintain separate single-image and carousel paths.
  - Keep polling limits within `vercel.json` `maxDuration`.

## Deployment

Deploy with:

```bash
npx vercel --prod
```

After deployment, confirm the frontend `PROXY_URL` points to the deployed backend and set `ALLOWED_ORIGIN` to the frontend origin in Vercel.
