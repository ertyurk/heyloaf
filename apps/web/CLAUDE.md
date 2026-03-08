# Heyloaf Web App

TanStack Start (SSR + SPA) with React 19.

## Stack
- **Framework:** TanStack Start (Nitro runtime)
- **Router:** TanStack Router (file-based routing)
- **State:** TanStack Query (server) + TanStack Store (client)
- **Forms:** TanStack Form + Zod
- **UI:** `@heyloaf/ui` package (shadcn components)
- **Styling:** Tailwind CSS 4
- **Linting:** Biome (not ESLint)

## File Structure
```
src/
├── routes/          # File-based routing (TanStack Router)
│   ├── __root.tsx   # Root layout
│   └── index.tsx    # Home page
├── components/      # App-specific components (NOT shared UI)
├── hooks/           # App-specific hooks
├── lib/             # App-specific utilities
└── router.tsx       # Router config
```

## Key Rules
- **Shared UI → `@heyloaf/ui`** (imported as `@heyloaf/ui/components/button`)
- **App components → `@/components/`** (local, not shared)
- Route files auto-generate `routeTree.gen.ts` — never edit it
- Imports from `@heyloaf/ui` map to `../../packages/ui/src/*` via tsconfig paths
- RTL support enabled in shadcn config
- Base UI primitives (not Radix) — use `data-*` attribute selectors

## Dev
```bash
just dev-web         # Start at localhost:3000
pnpm --filter @heyloaf/web build
pnpm --filter @heyloaf/web typecheck
```
