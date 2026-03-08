# Heyloaf UI Package

Shared component library using shadcn pattern. Used by web, desktop (via web), and future mobile (separate native lib).

## Stack
- **Components:** shadcn (base-nova style)
- **Primitives:** Base UI (not Radix) — use `data-*` attribute selectors
- **Variants:** CVA (class-variance-authority)
- **Merging:** `cn()` helper from `lib/utils.ts` (clsx + tailwind-merge)
- **Icons:** Hugeicons
- **Styling:** Tailwind CSS 4, CSS variables for theming

## Adding Components
```bash
cd packages/ui && pnpm dlx shadcn@latest add <component>
```
Components install to `src/components/`. The `components.json` config controls paths.

## Consuming in Apps
```tsx
import { Button } from "@heyloaf/ui/components/button"
import { cn } from "@heyloaf/ui/lib/utils"
```

## Exports (package.json)
```
./globals.css      → src/styles/globals.css
./lib/*            → src/lib/*.ts
./components/*     → src/components/*.tsx
./hooks/*          → src/hooks/*.ts
```

## Rules
- **No hardcoded colors** — use CSS variables (`--primary`, `--background`, etc.)
- **CVA for variants** — don't use ternaries for conditional classes
- **cn() for class merging** — don't concatenate className strings
- **RTL enabled** — components support right-to-left layout
- All components reusable across apps — no app-specific logic here
