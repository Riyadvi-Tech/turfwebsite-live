# React + Vite

## Secure Admin Password Reset

The reset flow uses the Vercel serverless API function, MongoDB Atlas, bcrypt, and SMTP. The MongoDB database must contain the `admin_users`, `admin_sessions`, and `password_reset_tokens` collections.

Configure these server-only Vercel environment variables:

`MONGODB_URI`, `MONGODB_DB`, `APP_URL`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and optionally `SMTP_SECURE=true`.

Never expose SMTP or database credentials through Vite variables or frontend code. The email provider must be configured before the request endpoint can successfully deliver a reset email.

### Deployment checklist (Vercel)

1. **Project root = the `react-app` folder.** The single function at `api/index.js` dispatches every existing `/api/*` endpoint through the rewrite in `vercel.json` to its implementation under `server/`, otherwise `/api/admin/login` returns 404 and the login form shows "Incorrect email or password."
2. **Build framework = Vite** (build command `npm run build`, output `dist`).
3. **Set the server-only env vars** listed above in the Vercel project (Production). `APP_URL` must be the deployed HTTPS origin, e.g. `https://turfon24.vercel.app` — never `localhost`.
4. **Configure MongoDB Atlas** and create the required admin and payment documents. Local and production admin sign-in both query the real `admin_users` and `admin_sessions` collections.
5. Local development uses the same API handlers and MongoDB connection path as production. If Atlas is unavailable or `MONGODB_URI` is missing, database-backed requests return HTTP 503 instead of using temporary mock data.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
