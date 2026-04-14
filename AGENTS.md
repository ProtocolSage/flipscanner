# Repository Guidelines

## Project Structure & Module Organization
`app/` contains the Next.js App Router code. Use [app/page.tsx](/Users/pablo/dev/flipscanner/app/page.tsx) for the main client UI, [app/api/analyze/route.ts](/Users/pablo/dev/flipscanner/app/api/analyze/route.ts) for the server-side xAI integration, and [app/globals.css](/Users/pablo/dev/flipscanner/app/globals.css) for global Tailwind styles. Shared types and browser persistence live in `lib/` (`types.ts`, `storage.ts`). Static assets belong in `public/`; current app metadata is in `public/manifest.json`.

## Build, Test, and Development Commands
Use `pnpm` by default because `pnpm-lock.yaml` is committed.

- `pnpm install` installs dependencies.
- `pnpm dev` starts the local app at `http://localhost:3000`.
- `pnpm build` creates a production build and catches integration issues.
- `pnpm start` serves the production build locally.
- `pnpm lint` runs Next.js lint rules.
- `pnpm typecheck` runs `tsc --noEmit` with strict TypeScript settings.

## Coding Style & Naming Conventions
This repo is TypeScript-first with `strict: true` and the `@/*` import alias. Match the existing style in `app/page.tsx` and `app/api/analyze/route.ts`: 2-space indentation, semicolons, single quotes, and clear helper extraction for non-trivial UI or prompt logic. Use `PascalCase` for React components, `camelCase` for functions and variables, and `UPPER_SNAKE_CASE` for shared constants. Keep server-only secrets out of client components.

## Testing Guidelines
There is no dedicated test suite yet. Until one is added, treat `pnpm lint`, `pnpm typecheck`, and `pnpm build` as the required validation set for every change. For feature work, also do a manual smoke test of the affected flow in the browser, especially camera upload, history persistence, and `/api/analyze` behavior.

## Commit & Pull Request Guidelines
The current history uses Conventional Commits (`feat: ...`), so continue with prefixes like `feat:`, `fix:`, and `chore:`. Keep commits focused and descriptive. Pull requests should explain the user-visible change, note any env or API impacts, link the related issue if one exists, and include screenshots or short recordings for UI changes.

## Security & Configuration Tips
Store secrets in `.env.local`; never commit real API keys. `XAI_API_KEY` is required, and `XAI_MODEL` is optional. Keep xAI access in server routes only and preserve the current boundary where the browser never receives the raw API key.
