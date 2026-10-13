# @thedot/design-system Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@thedot/design-system`, a standalone in-repo React component library (13 foundation components + tokens) extracted from `thedot-site`, buildable to `dist/` and renderable in Storybook, ready to sync to Claude Design via `/design-sync`.

**Architecture:** New npm-workspaces package at `packages/design-system/`. Design tokens live in `tokens.css` (CSS custom properties, the single source of truth) mirrored by `tokens.ts`. Each component is a folder with `<Name>.tsx` (typed props), `<Name>.module.css` (CSS Modules consuming `var(--dot-*)`), and `<Name>.stories.tsx`. `tsup` compiles `src/` → `dist/` (ESM + `.d.ts` + one bundled `dist/index.css`). Brand devices (`Dot`, `DotGrid`, `Stripe`, `Arrow`) are CSS/inline-SVG generated from tokens — no binary imports. Figma vector assets (`main-logo`, `favicon`, `dot-pattern`) ship as static files under `src/assets` copied to `dist/assets`. **The live site (`src/**` at repo root) is never modified.**

**Tech Stack:** React 19 (peer), TypeScript 5, tsup 8, Storybook 8 (`@storybook/react-vite`), Vite 5, Vitest 2 + React Testing Library, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-07-15-thedot-design-system-design.md`
**Branch:** `feat/thedot-design-system`

**Testing philosophy (per spec §5):** TDD with RTL for the *interactive* components only — `Input`, `Textarea`, `Selector` — plus a token-value test. Presentational components are verified by: `tsc --noEmit` typecheck + a green `tsup` build + their Storybook story rendering. Do not write trivial render tests for pure presentational components.

---

## File Structure

```
package.json                                  MODIFY: add "workspaces": ["packages/*"]
packages/design-system/
  package.json                                CREATE: pkg meta, scripts, deps
  tsconfig.json                               CREATE: TS config
  tsup.config.ts                              CREATE: build config
  vitest.config.ts                            CREATE: test config
  test/setup.ts                               CREATE: jest-dom setup
  .storybook/main.ts                          CREATE: storybook config
  .storybook/preview.tsx                      CREATE: global decorators/styles
  src/
    index.ts                                  CREATE: barrel export
    tokens/tokens.css                         CREATE: CSS variables (source of truth)
    tokens/tokens.ts                          CREATE: JS token mirror
    styles/fonts.css                          CREATE: Typekit documentation/import
    styles/reset.css                          CREATE: minimal reset
    assets/{main-logo,favicon,dot-pattern}.svg CREATE: copied from brand-kit/figma
    assets/index.ts                           CREATE: asset URL exports
    components/Heading/{Heading.tsx,Heading.module.css,Heading.stories.tsx,index.ts}
    components/Text/{...}
    components/Eyebrow/{...}
    components/Button/{...}
    components/Card/{...}
    components/Tag/{...}
    components/Input/{Input.tsx,Input.module.css,Input.stories.tsx,Input.test.tsx,index.ts}
    components/Textarea/{...,Textarea.test.tsx,...}
    components/Selector/{...,Selector.test.tsx,...}
    components/Dot/{...}
    components/DotGrid/{...}
    components/Stripe/{...}
    components/Arrow/{...}
```

---

## Task 1: Scaffold workspace and package

**Files:**
- Modify: `package.json` (repo root)
- Create: `packages/design-system/package.json`
- Create: `packages/design-system/tsconfig.json`
- Create: `packages/design-system/tsup.config.ts`
- Create: `packages/design-system/vitest.config.ts`
- Create: `packages/design-system/test/setup.ts`
- Create: `packages/design-system/src/index.ts`

- [ ] **Step 1: Add workspaces to root package.json**

Open `package.json` (repo root). Add a top-level `"workspaces"` key (keep everything else unchanged):

```json
"workspaces": ["packages/*"],
```

- [ ] **Step 2: Create the package manifest**

Create `packages/design-system/package.json`:

```json
{
  "name": "@thedot/design-system",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "sideEffects": ["**/*.css"],
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./styles.css": "./dist/index.css",
    "./assets/*": "./dist/assets/*"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup && cp -R src/assets dist/assets",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  },
  "peerDependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" },
  "devDependencies": {
    "@storybook/react-vite": "^8.3.0",
    "storybook": "^8.3.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^25.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Create `packages/design-system/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "noEmit": true
  },
  "include": ["src", "test", "*.ts"]
}
```

- [ ] **Step 4: Create tsup.config.ts**

Create `packages/design-system/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  // esbuild compiles imported *.module.css and emits dist/index.css
});
```

- [ ] **Step 5: Create vitest.config.ts and test setup**

Create `packages/design-system/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    css: true,
  },
});
```

Create `packages/design-system/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Create a temporary index stub and the assets dir so the build works**

Create `packages/design-system/src/index.ts`:

```ts
export {};
```

Create the assets directory so the build's `cp` has a source from the very first build:

```bash
mkdir -p packages/design-system/src/assets
touch packages/design-system/src/assets/.gitkeep
```

- [ ] **Step 7: Install and verify the workspace resolves**

Run from repo root: `npm install`
Expected: completes without error; `packages/design-system/node_modules` (or hoisted root) present.

Run: `npm run build --workspace @thedot/design-system`
Expected: tsup emits `dist/index.js` and `dist/index.d.ts` (empty module is fine); `cp` copies `dist/assets/` (contains only `.gitkeep` for now).

- [ ] **Step 8: Verify the site build is unaffected**

Run from repo root: `npm run build`
Expected: `next build` still succeeds (workspaces addition is non-breaking). If it fails, STOP and report — do not proceed.

- [ ] **Step 9: Commit**

```bash
git add package.json packages/design-system/package.json packages/design-system/tsconfig.json packages/design-system/tsup.config.ts packages/design-system/vitest.config.ts packages/design-system/test/setup.ts packages/design-system/src/index.ts package-lock.json
git commit -m "chore(ds): scaffold @thedot/design-system workspace package"
```

---

## Task 2: Design tokens

**Files:**
- Create: `packages/design-system/src/tokens/tokens.css`
- Create: `packages/design-system/src/tokens/tokens.ts`
- Test: `packages/design-system/src/tokens/tokens.test.ts`

- [ ] **Step 1: Write the failing token test**

Create `packages/design-system/src/tokens/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { colors, fonts } from './tokens';

describe('brand tokens', () => {
  it('exposes the 6-color Figma-sourced palette', () => {
    expect(colors).toMatchObject({
      black: '#35332f',
      cream: '#faf9f6',
      yellow: '#daff00',
      white: '#ffffff',
      grey: '#7a776f',
      graphite: '#47453f',
    });
  });
  it('names the Adobe Typekit families', () => {
    expect(fonts.display).toContain('futura-pt');
    expect(fonts.text).toContain('ff-real-text-pro');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace @thedot/design-system`
Expected: FAIL — cannot import `./tokens` (module not found).

- [ ] **Step 3: Create tokens.css (source of truth)**

Create `packages/design-system/src/tokens/tokens.css`:

```css
:root {
  /* Brand palette — Figma "The Dot Styleguide" (superset: 6) */
  --dot-black:#35332f; --dot-cream:#faf9f6; --dot-yellow:#daff00;
  --dot-white:#ffffff; --dot-grey:#7a776f; --dot-graphite:#47453f;
  --dot-yellow-pale:#eefb9d; --dot-hairline:#ebebe7;

  /* Signature gradients (from site CSS) */
  --dot-grad-fill:radial-gradient(circle farthest-corner at 50% 50%, #daff00cc, #faf9f6);
  --dot-grad-corner:radial-gradient(circle farthest-corner at 100% 0%, #daff00cf, #eefb9dbd 34%, #faf9f6 53%);
  --dot-grad-edge:radial-gradient(circle farthest-corner at 100% 50%, #daff00a1, #faf9f6);
  --dot-grad-wash:linear-gradient(to bottom, #faf9f6, #daff00a3);
  --dot-grad-96:linear-gradient(96deg, #faf9f6, #daff00);
  --dot-grad-135:linear-gradient(135deg, #daff00 0%, #faf9f6 100%);
  --dot-grad-silver:radial-gradient(circle at 35% 30%, #ffffff, #d8d6d1 52%, #9c9a94 100%);

  /* Type */
  --dot-font-display:'futura-pt','Futura','Avenir Next','Helvetica Neue',Arial,sans-serif;
  --dot-font-text:'ff-real-text-pro',sans-serif;
  --dot-weight-light:200; --dot-weight-book:300; --dot-weight-medium:500; --dot-weight-demi:600;
  --dot-text-hero:clamp(3rem,8vw,6rem); --dot-text-h1:clamp(3rem,8vw,5rem);
  --dot-text-h2:clamp(2.5rem,6vw,4rem); --dot-text-section:4.2rem;
  --dot-text-h3:clamp(1.5rem,4vw,2.375rem); --dot-text-h4:clamp(1.25rem,3vw,1.875rem);
  --dot-text-body:1.0625rem; --dot-text-eyebrow:0.78rem;

  /* Space + radius */
  --dot-space-1:4px; --dot-space-2:8px; --dot-space-3:12px; --dot-space-4:16px;
  --dot-space-5:24px; --dot-space-6:32px; --dot-space-7:48px; --dot-space-8:64px;
  --dot-radius:0; --dot-radius-circle:50%;
}
```

- [ ] **Step 4: Create tokens.ts (JS mirror)**

Create `packages/design-system/src/tokens/tokens.ts`:

```ts
export const colors = {
  black: '#35332f', cream: '#faf9f6', yellow: '#daff00',
  white: '#ffffff', grey: '#7a776f', graphite: '#47453f',
  yellowPale: '#eefb9d', hairline: '#ebebe7',
} as const;

export const fonts = {
  display: "'futura-pt','Futura','Avenir Next','Helvetica Neue',Arial,sans-serif",
  text: "'ff-real-text-pro',sans-serif",
} as const;

export const weights = { light: 200, book: 300, medium: 500, demi: 600 } as const;

export const space = { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '24px', 6: '32px', 7: '48px', 8: '64px' } as const;

export const radius = { sharp: '0', circle: '50%' } as const;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test --workspace @thedot/design-system`
Expected: PASS (2 tests).

- [ ] **Step 6: Import tokens.css from the barrel so it lands in dist/index.css**

Replace `packages/design-system/src/index.ts` with:

```ts
import './tokens/tokens.css';
export * from './tokens/tokens';
```

- [ ] **Step 7: Commit**

```bash
git add packages/design-system/src/tokens packages/design-system/src/index.ts
git commit -m "feat(ds): add design tokens (6-color palette, gradients, type scale)"
```

---

## Task 3: Global styles (fonts + reset)

**Files:**
- Create: `packages/design-system/src/styles/fonts.css`
- Create: `packages/design-system/src/styles/reset.css`
- Modify: `packages/design-system/src/index.ts`

- [ ] **Step 1: Create fonts.css**

Create `packages/design-system/src/styles/fonts.css`:

```css
/* Adobe Typekit kit gac6jnd — futura-pt + ff-real-text-pro.
   Consumers MUST load this in their document <head>:
   <link rel="stylesheet" href="https://use.typekit.net/gac6jnd.css">
   @import is declared here so Storybook/preview picks it up; production
   apps should prefer the <link> for performance. */
@import url('https://use.typekit.net/gac6jnd.css');
```

- [ ] **Step 2: Create reset.css**

Create `packages/design-system/src/styles/reset.css`:

```css
.dot-root, .dot-root * { box-sizing: border-box; }
.dot-root { margin: 0; color: var(--dot-black); font-family: var(--dot-font-text); background: var(--dot-cream); }
```

- [ ] **Step 3: Import both from the barrel**

Update `packages/design-system/src/index.ts` to:

```ts
import './styles/fonts.css';
import './tokens/tokens.css';
import './styles/reset.css';
export * from './tokens/tokens';
```

- [ ] **Step 4: Verify build still emits CSS**

Run: `npm run build --workspace @thedot/design-system`
Expected: `dist/index.css` exists and contains `--dot-black` and `use.typekit.net`.
Verify: `grep -c "use.typekit.net" packages/design-system/dist/index.css` → ≥ 1.

- [ ] **Step 5: Commit**

```bash
git add packages/design-system/src/styles packages/design-system/src/index.ts
git commit -m "feat(ds): add fonts.css (Typekit) and scoped reset"
```

---

## Task 4: Brand assets

**Files:**
- Create: `packages/design-system/src/assets/{main-logo,favicon,dot-pattern}.svg`
- Create: `packages/design-system/src/assets/index.ts`

- [ ] **Step 1: Copy the Figma vector assets + decorative motifs into the package**

Run from repo root (Figma vectors + the `public/images` brand motifs from spec §8; `arrow.png`/`line.png` are intentionally NOT copied — `Arrow` and `Stripe` are generated in code, superseding those rasters):

```bash
mkdir -p packages/design-system/src/assets
cp brand-kit/figma/main-logo.svg   packages/design-system/src/assets/main-logo.svg
cp brand-kit/figma/favicon.svg     packages/design-system/src/assets/favicon.svg
cp brand-kit/figma/dot-pattern.svg packages/design-system/src/assets/dot-pattern.svg
cp public/images/7_1.svg           packages/design-system/src/assets/dot-motif.svg
cp public/images/Group-6-2.svg     packages/design-system/src/assets/shape-6-2.svg
cp public/images/Group-6-3.svg     packages/design-system/src/assets/shape-6-3.svg
cp public/images/Group-7-1.svg     packages/design-system/src/assets/shape-7-1.svg
ls -1 packages/design-system/src/assets
```
Expected: seven `.svg` files listed (plus `.gitkeep`).

- [ ] **Step 2: Create an asset URL index (Vite/consumer resolves as URL)**

Create `packages/design-system/src/assets/index.ts`:

```ts
// Static asset URLs. Consumers with a bundler (Vite/webpack) resolve these to URLs.
// The raw files also ship under dist/assets for direct <img src="/…/dist/assets/…"> use.
export const assetPaths = {
  logo: 'assets/main-logo.svg',
  favicon: 'assets/favicon.svg',
  dotPattern: 'assets/dot-pattern.svg',
  dotMotif: 'assets/dot-motif.svg',
  shape62: 'assets/shape-6-2.svg',
  shape63: 'assets/shape-6-3.svg',
  shape71: 'assets/shape-7-1.svg',
} as const;
```

- [ ] **Step 3: Verify the build copies assets to dist**

Run: `npm run build --workspace @thedot/design-system`
Expected: `packages/design-system/dist/assets/` contains the three SVGs.
Verify: `ls packages/design-system/dist/assets`

- [ ] **Step 4: Commit**

```bash
git add packages/design-system/src/assets
git commit -m "feat(ds): add Figma vector assets (logo, favicon, dot-pattern)"
```

---

## Task 5: Storybook setup

**Files:**
- Create: `packages/design-system/.storybook/main.ts`
- Create: `packages/design-system/.storybook/preview.ts`

- [ ] **Step 1: Create Storybook main.ts**

Create `packages/design-system/.storybook/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: { name: '@storybook/react-vite', options: {} },
};
export default config;
```

- [ ] **Step 2: Create Storybook preview.tsx (loads all global CSS, wraps every story)**

Create `packages/design-system/.storybook/preview.tsx` (note the `.tsx` extension — the decorator returns JSX):

```tsx
import type { Preview } from '@storybook/react';
import '../src/styles/fonts.css';
import '../src/tokens/tokens.css';
import '../src/styles/reset.css';

const preview: Preview = {
  parameters: {
    backgrounds: { default: 'cream', values: [{ name: 'cream', value: '#faf9f6' }] },
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="dot-root">
        <Story />
      </div>
    ),
  ],
};
export default preview;
```

Every story renders inside an element with class `dot-root` on a `#faf9f6` background with Typekit loaded.

- [ ] **Step 3: Smoke-test Storybook boots**

Run: `npm run build-storybook --workspace @thedot/design-system`
Expected: builds to `storybook-static/` without error (no stories yet is fine — it may warn about zero stories; that is acceptable).

- [ ] **Step 4: Commit**

```bash
git add packages/design-system/.storybook
git commit -m "chore(ds): add Storybook (react-vite) config and preview"
```

---

## Task 6: Heading component

**Files:**
- Create: `packages/design-system/src/components/Heading/Heading.tsx`
- Create: `packages/design-system/src/components/Heading/Heading.module.css`
- Create: `packages/design-system/src/components/Heading/Heading.stories.tsx`
- Create: `packages/design-system/src/components/Heading/index.ts`

- [ ] **Step 1: Create the component**

Create `packages/design-system/src/components/Heading/Heading.tsx`:

```tsx
import type { ElementType, ReactNode } from 'react';
import styles from './Heading.module.css';

export interface HeadingProps {
  level?: 1 | 2 | 3 | 4;
  variant?: 'display' | 'section';
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

const tagFor = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const;

export function Heading({ level = 1, variant, as, className, children }: HeadingProps) {
  const Tag = (as ?? tagFor[level]) as ElementType;
  const cls = [styles.heading, styles[`l${level}`], variant && styles[variant], className]
    .filter(Boolean).join(' ');
  return <Tag className={cls}>{children}</Tag>;
}
```

- [ ] **Step 2: Create the styles**

Create `packages/design-system/src/components/Heading/Heading.module.css`:

```css
.heading { margin: 0; color: var(--dot-black); line-height: 1.1; }
.l1 { font-family: var(--dot-font-display); font-weight: var(--dot-weight-light); font-size: var(--dot-text-h1); }
.l2 { font-family: var(--dot-font-display); font-weight: var(--dot-weight-light); font-size: var(--dot-text-h2); line-height: 1.2; }
.l3 { font-family: var(--dot-font-text); font-weight: var(--dot-weight-book); font-size: var(--dot-text-h3); line-height: 1.3; }
.l4 { font-family: var(--dot-font-text); font-weight: var(--dot-weight-book); font-size: var(--dot-text-h4); line-height: 1.4; }
.display { font-family: var(--dot-font-display); font-weight: var(--dot-weight-light); font-size: var(--dot-text-hero); letter-spacing: -0.01em; }
.section { font-family: var(--dot-font-text); font-weight: var(--dot-weight-book); font-size: var(--dot-text-section); letter-spacing: -0.02em; }
```

- [ ] **Step 3: Create the story**

Create `packages/design-system/src/components/Heading/Heading.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Heading } from './Heading';

const meta: Meta<typeof Heading> = { title: 'Type/Heading', component: Heading };
export default meta;
type Story = StoryObj<typeof Heading>;

export const AllLevels: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 24 }}>
      <Heading variant="display">Design that gets to the point</Heading>
      <Heading level={1}>Brands that attract</Heading>
      <Heading level={2}>Websites that convert</Heading>
      <Heading variant="section">Systems that grow</Heading>
      <Heading level={3}>Strategic web design</Heading>
      <Heading level={4}>Business systems integration</Heading>
    </div>
  ),
};
```

- [ ] **Step 4: Create the index and export from barrel**

Create `packages/design-system/src/components/Heading/index.ts`:

```ts
export { Heading } from './Heading';
export type { HeadingProps } from './Heading';
```

Append to `packages/design-system/src/index.ts`:

```ts
export * from './components/Heading';
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck --workspace @thedot/design-system` → Expected: no errors.
Run: `npm run build --workspace @thedot/design-system` → Expected: `dist/index.css` now contains `.heading` (hashed) rules.

- [ ] **Step 6: Commit**

```bash
git add packages/design-system/src/components/Heading packages/design-system/src/index.ts
git commit -m "feat(ds): add Heading component"
```

---

## Task 7: Text and Eyebrow components

**Files:**
- Create: `packages/design-system/src/components/Text/{Text.tsx,Text.module.css,Text.stories.tsx,index.ts}`
- Create: `packages/design-system/src/components/Eyebrow/{Eyebrow.tsx,Eyebrow.module.css,Eyebrow.stories.tsx,index.ts}`
- Modify: `packages/design-system/src/index.ts`

- [ ] **Step 1: Create Text.tsx**

```tsx
import type { ElementType, ReactNode } from 'react';
import styles from './Text.module.css';

export interface TextProps {
  size?: 'lg' | 'md' | 'sm';
  tone?: 'black' | 'grey' | 'graphite';
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

export function Text({ size = 'md', tone = 'black', as, className, children }: TextProps) {
  const Tag = (as ?? 'p') as ElementType;
  const cls = [styles.text, styles[size], styles[tone], className].filter(Boolean).join(' ');
  return <Tag className={cls}>{children}</Tag>;
}
```

- [ ] **Step 2: Create Text.module.css**

```css
.text { margin: 0; font-family: var(--dot-font-text); font-weight: 400; line-height: 1.55; }
.lg { font-size: 1.15rem; }
.md { font-size: var(--dot-text-body); }
.sm { font-size: 0.9rem; }
.black { color: var(--dot-black); }
.grey { color: var(--dot-grey); }
.graphite { color: var(--dot-graphite); }
```

- [ ] **Step 3: Create Text.stories.tsx**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Text } from './Text';

const meta: Meta<typeof Text> = { title: 'Type/Text', component: Text };
export default meta;
type Story = StoryObj<typeof Text>;

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
      <Text size="lg">Large body — we build fast, distinctive websites.</Text>
      <Text size="md">Medium body — consistent color, type, and components.</Text>
      <Text size="sm" tone="grey">Small / grey — captions and meta.</Text>
      <Text tone="graphite">Graphite tone body copy.</Text>
    </div>
  ),
};
```

- [ ] **Step 4: Create Text/index.ts**

```ts
export { Text } from './Text';
export type { TextProps } from './Text';
```

- [ ] **Step 5: Create Eyebrow.tsx**

```tsx
import type { ReactNode } from 'react';
import styles from './Eyebrow.module.css';

export interface EyebrowProps {
  tone?: 'grey' | 'black';
  className?: string;
  children: ReactNode;
}

export function Eyebrow({ tone = 'grey', className, children }: EyebrowProps) {
  const cls = [styles.eyebrow, styles[tone], className].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}
```

- [ ] **Step 6: Create Eyebrow.module.css**

```css
.eyebrow { font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi);
  text-transform: uppercase; letter-spacing: 0.2em; font-size: var(--dot-text-eyebrow); }
.grey { color: var(--dot-grey); }
.black { color: var(--dot-black); }
```

- [ ] **Step 7: Create Eyebrow.stories.tsx**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Eyebrow } from './Eyebrow';

const meta: Meta<typeof Eyebrow> = { title: 'Type/Eyebrow', component: Eyebrow };
export default meta;
type Story = StoryObj<typeof Eyebrow>;

export const Default: Story = { render: () => <Eyebrow>Selected Work · 2026</Eyebrow> };
```

- [ ] **Step 8: Create Eyebrow/index.ts**

```ts
export { Eyebrow } from './Eyebrow';
export type { EyebrowProps } from './Eyebrow';
```

- [ ] **Step 9: Export both from the barrel**

Append to `packages/design-system/src/index.ts`:

```ts
export * from './components/Text';
export * from './components/Eyebrow';
```

- [ ] **Step 10: Typecheck, build, commit**

Run: `npm run typecheck --workspace @thedot/design-system` → Expected: no errors.
Run: `npm run build --workspace @thedot/design-system` → Expected: success.

```bash
git add packages/design-system/src/components/Text packages/design-system/src/components/Eyebrow packages/design-system/src/index.ts
git commit -m "feat(ds): add Text and Eyebrow components"
```

---

## Task 8: Button component

**Files:**
- Create: `packages/design-system/src/components/Button/{Button.tsx,Button.module.css,Button.stories.tsx,index.ts}`
- Modify: `packages/design-system/src/index.ts`

- [ ] **Step 1: Create Button.tsx**

```tsx
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Common = { variant?: 'black' | 'yellow' | 'ghost'; size?: 'md' | 'sm'; className?: string; children: ReactNode };
export type ButtonProps =
  | (Common & { as?: 'button' } & ButtonHTMLAttributes<HTMLButtonElement>)
  | (Common & { as: 'a' } & AnchorHTMLAttributes<HTMLAnchorElement>);

export function Button(props: ButtonProps) {
  const { variant = 'black', size = 'md', className, children, as = 'button', ...rest } = props as Common & { as?: 'button' | 'a' };
  const cls = [styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ');
  if (as === 'a') return <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>;
  return <button className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>;
}
```

- [ ] **Step 2: Create Button.module.css**

```css
.button { display: inline-block; font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi);
  text-transform: uppercase; letter-spacing: 0.1em; border-radius: var(--dot-radius); border: 2px solid var(--dot-black);
  cursor: pointer; text-decoration: none; line-height: 1; transition: background .2s, color .2s; }
.md { font-size: 0.8rem; padding: 14px 30px; }
.sm { font-size: 0.72rem; padding: 10px 20px; }
.black { background: var(--dot-black); color: var(--dot-cream); }
.yellow { background: var(--dot-yellow); color: var(--dot-black); border-color: var(--dot-black); }
.ghost { background: transparent; color: var(--dot-black); }
.ghost:hover { background: var(--dot-black); color: var(--dot-cream); }
```

- [ ] **Step 3: Create Button.stories.tsx**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = { title: 'Actions/Button', component: Button };
export default meta;
type Story = StoryObj<typeof Button>;

export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <Button variant="yellow">Start a project</Button>
      <Button variant="black">View work</Button>
      <Button variant="ghost">Learn more</Button>
      <Button variant="black" size="sm">Small</Button>
    </div>
  ),
};
```

- [ ] **Step 4: Create Button/index.ts and export from barrel**

```ts
export { Button } from './Button';
export type { ButtonProps } from './Button';
```

Append to `packages/design-system/src/index.ts`:

```ts
export * from './components/Button';
```

- [ ] **Step 5: Typecheck, build, commit**

Run: `npm run typecheck --workspace @thedot/design-system` → Expected: no errors.

```bash
git add packages/design-system/src/components/Button packages/design-system/src/index.ts
git commit -m "feat(ds): add Button component"
```

---

## Task 9: Card and Tag components

**Files:**
- Create: `packages/design-system/src/components/Card/{Card.tsx,Card.module.css,Card.stories.tsx,index.ts}`
- Create: `packages/design-system/src/components/Tag/{Tag.tsx,Tag.module.css,Tag.stories.tsx,index.ts}`
- Modify: `packages/design-system/src/index.ts`

- [ ] **Step 1: Create Card.tsx**

```tsx
import type { ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Card({ eyebrow, title, className, children }: CardProps) {
  return (
    <div className={[styles.card, className].filter(Boolean).join(' ')}>
      {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
      {title && <h4 className={styles.title}>{title}</h4>}
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Create Card.module.css**

```css
.card { background: var(--dot-white); border: 1px solid var(--dot-hairline); border-radius: var(--dot-radius);
  padding: var(--dot-space-6); max-width: 340px; }
.eyebrow { display: block; font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi);
  text-transform: uppercase; letter-spacing: 0.18em; font-size: 0.68rem; color: var(--dot-grey); margin-bottom: 10px; }
.title { margin: 0 0 8px; font-family: var(--dot-font-text); font-weight: var(--dot-weight-book); font-size: 1.5rem; line-height: 1.25; color: var(--dot-black); }
.body { font-family: var(--dot-font-text); font-size: 0.9rem; color: var(--dot-grey); }
```

- [ ] **Step 3: Create Card.stories.tsx**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = { title: 'Content/Card', component: Card };
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card eyebrow="Service" title="Conversion-first web design">
      Editorial layouts, sharp corners, a warm canvas — and one confident yellow glow.
    </Card>
  ),
};
```

- [ ] **Step 4: Create Card/index.ts**

```ts
export { Card } from './Card';
export type { CardProps } from './Card';
```

- [ ] **Step 5: Create Tag.tsx**

```tsx
import type { ReactNode } from 'react';
import styles from './Tag.module.css';

export interface TagProps { tone?: 'yellow' | 'black'; className?: string; children: ReactNode }

export function Tag({ tone = 'yellow', className, children }: TagProps) {
  return <span className={[styles.tag, styles[tone], className].filter(Boolean).join(' ')}>{children}</span>;
}
```

- [ ] **Step 6: Create Tag.module.css**

```css
.tag { display: inline-block; font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi);
  text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.66rem; padding: 6px 12px; border-radius: var(--dot-radius); }
.yellow { background: var(--dot-yellow); color: var(--dot-black); }
.black { background: var(--dot-black); color: var(--dot-cream); }
```

- [ ] **Step 7: Create Tag.stories.tsx**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Tag } from './Tag';

const meta: Meta<typeof Tag> = { title: 'Content/Tag', component: Tag };
export default meta;
type Story = StoryObj<typeof Tag>;

export const Tones: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}><Tag>New</Tag><Tag tone="black">Case study</Tag></div>
  ),
};
```

- [ ] **Step 8: Create Tag/index.ts and export both from barrel**

```ts
export { Tag } from './Tag';
export type { TagProps } from './Tag';
```

Append to `packages/design-system/src/index.ts`:

```ts
export * from './components/Card';
export * from './components/Tag';
```

- [ ] **Step 9: Typecheck, build, commit**

Run: `npm run typecheck --workspace @thedot/design-system` → Expected: no errors.

```bash
git add packages/design-system/src/components/Card packages/design-system/src/components/Tag packages/design-system/src/index.ts
git commit -m "feat(ds): add Card and Tag components"
```

---

## Task 10: Input and Textarea (TDD — interactive)

**Files:**
- Create: `packages/design-system/src/components/Input/{Input.tsx,Input.module.css,Input.stories.tsx,Input.test.tsx,index.ts}`
- Create: `packages/design-system/src/components/Textarea/{Textarea.tsx,Textarea.module.css,Textarea.stories.tsx,Textarea.test.tsx,index.ts}`
- Modify: `packages/design-system/src/index.ts`

- [ ] **Step 1: Write the failing Input test**

Create `packages/design-system/src/components/Input/Input.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Input } from './Input';

describe('Input', () => {
  it('associates the label with the field', () => {
    render(<Input label="Email" id="email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('marks the field invalid via aria-invalid', () => {
    render(<Input label="Email" id="email" invalid />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('is controllable', async () => {
    function Controlled() {
      const [v, setV] = useState('');
      return <Input label="Name" id="name" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    render(<Controlled />);
    await userEvent.type(screen.getByLabelText('Name'), 'Dot');
    expect(screen.getByLabelText('Name')).toHaveValue('Dot');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace @thedot/design-system`
Expected: FAIL — cannot import `./Input`.

- [ ] **Step 3: Create Input.tsx**

```tsx
import type { InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  invalid?: boolean;
}

export function Input({ label, invalid, id, className, ...rest }: InputProps) {
  return (
    <span className={styles.field}>
      {label && <label className={styles.label} htmlFor={id}>{label}</label>}
      <input
        id={id}
        className={[styles.input, invalid && styles.invalid, className].filter(Boolean).join(' ')}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </span>
  );
}
```

- [ ] **Step 4: Create Input.module.css**

```css
.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi); text-transform: uppercase;
  letter-spacing: 0.12em; font-size: 0.7rem; color: var(--dot-grey); }
.input { font-family: var(--dot-font-text); font-size: 1rem; color: var(--dot-black); background: var(--dot-white);
  border: 1px solid var(--dot-hairline); border-radius: var(--dot-radius); padding: 12px 14px; outline: none; }
.input:focus { border-color: var(--dot-black); }
.invalid { border-color: #c0392b; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test --workspace @thedot/design-system`
Expected: PASS (Input tests green).

- [ ] **Step 6: Create Input.stories.tsx and index.ts**

`Input.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './Input';

const meta: Meta<typeof Input> = { title: 'Forms/Input', component: Input };
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { label: 'Email', id: 'email', placeholder: 'you@company.com' } };
export const Invalid: Story = { args: { label: 'Email', id: 'email2', invalid: true, defaultValue: 'nope' } };
```

`Input/index.ts`:

```ts
export { Input } from './Input';
export type { InputProps } from './Input';
```

- [ ] **Step 7: Write the failing Textarea test**

Create `packages/design-system/src/components/Textarea/Textarea.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('associates the label', () => {
    render(<Textarea label="Message" id="msg" />);
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
  });
  it('accepts typed input', async () => {
    render(<Textarea label="Message" id="msg" />);
    await userEvent.type(screen.getByLabelText('Message'), 'hi');
    expect(screen.getByLabelText('Message')).toHaveValue('hi');
  });
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `npm run test --workspace @thedot/design-system`
Expected: FAIL — cannot import `./Textarea`.

- [ ] **Step 9: Create Textarea.tsx**

```tsx
import type { TextareaHTMLAttributes } from 'react';
import styles from './Textarea.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  invalid?: boolean;
}

export function Textarea({ label, invalid, id, className, ...rest }: TextareaProps) {
  return (
    <span className={styles.field}>
      {label && <label className={styles.label} htmlFor={id}>{label}</label>}
      <textarea
        id={id}
        className={[styles.textarea, invalid && styles.invalid, className].filter(Boolean).join(' ')}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </span>
  );
}
```

- [ ] **Step 10: Create Textarea.module.css**

```css
.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-family: var(--dot-font-display); font-weight: var(--dot-weight-demi); text-transform: uppercase;
  letter-spacing: 0.12em; font-size: 0.7rem; color: var(--dot-grey); }
.textarea { font-family: var(--dot-font-text); font-size: 1rem; color: var(--dot-black); background: var(--dot-white);
  border: 1px solid var(--dot-hairline); border-radius: var(--dot-radius); padding: 12px 14px; outline: none; min-height: 120px; resize: vertical; }
.textarea:focus { border-color: var(--dot-black); }
.invalid { border-color: #c0392b; }
```

- [ ] **Step 11: Run to verify it passes**

Run: `npm run test --workspace @thedot/design-system`
Expected: PASS.

- [ ] **Step 12: Create Textarea.stories.tsx and index.ts**

`Textarea.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './Textarea';

const meta: Meta<typeof Textarea> = { title: 'Forms/Textarea', component: Textarea };
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = { args: { label: 'Message', id: 'message', placeholder: 'Tell us about your project…' } };
```

`Textarea/index.ts`:

```ts
export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';
```

- [ ] **Step 13: Export both from the barrel, typecheck, commit**

Append to `packages/design-system/src/index.ts`:

```ts
export * from './components/Input';
export * from './components/Textarea';
```

Run: `npm run typecheck --workspace @thedot/design-system` → Expected: no errors.
Run: `npm run test --workspace @thedot/design-system` → Expected: all PASS.

```bash
git add packages/design-system/src/components/Input packages/design-system/src/components/Textarea packages/design-system/src/index.ts
git commit -m "feat(ds): add Input and Textarea form fields (TDD)"
```

---

## Task 11: Selector (TDD — signature interactive)

**Files:**
- Create: `packages/design-system/src/components/Selector/{Selector.tsx,Selector.module.css,Selector.stories.tsx,Selector.test.tsx,index.ts}`
- Modify: `packages/design-system/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/design-system/src/components/Selector/Selector.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Selector } from './Selector';

describe('Selector', () => {
  it('renders a pressable option reflecting selected state', () => {
    render(<Selector selected>Half day</Selector>);
    expect(screen.getByRole('button', { name: 'Half day' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('fires onSelect when clicked', async () => {
    const onSelect = vi.fn();
    render(<Selector onSelect={onSelect}>Full day</Selector>);
    await userEvent.click(screen.getByRole('button', { name: 'Full day' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test --workspace @thedot/design-system`
Expected: FAIL — cannot import `./Selector`.

- [ ] **Step 3: Create Selector.tsx**

```tsx
import type { ReactNode } from 'react';
import styles from './Selector.module.css';

export interface SelectorProps {
  selected?: boolean;
  onSelect?: () => void;
  size?: number;
  className?: string;
  children: ReactNode;
}

export function Selector({ selected = false, onSelect, size = 120, className, children }: SelectorProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{ width: size, height: size }}
      className={[styles.selector, selected && styles.selected, className].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Create Selector.module.css**

```css
.selector { border-radius: var(--dot-radius-circle); border: 1px solid var(--dot-grey); background: var(--dot-white);
  color: var(--dot-black); font-family: var(--dot-font-text); font-weight: var(--dot-weight-book); font-size: 0.85rem;
  display: flex; align-items: center; justify-content: center; text-align: center; cursor: pointer; transition: all .35s; }
.selector:hover { background: var(--dot-grad-fill); }
.selected { background: var(--dot-grad-fill); border-color: var(--dot-black); }
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test --workspace @thedot/design-system`
Expected: PASS.

- [ ] **Step 6: Create Selector.stories.tsx and index.ts**

`Selector.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Selector } from './Selector';

const meta: Meta<typeof Selector> = { title: 'Forms/Selector', component: Selector };
export default meta;
type Story = StoryObj<typeof Selector>;

export const Group: Story = {
  render: () => {
    const [sel, setSel] = useState('half');
    return (
      <div style={{ display: 'flex', gap: 16 }}>
        <Selector selected={sel === 'half'} onSelect={() => setSel('half')}>Half day</Selector>
        <Selector selected={sel === 'full'} onSelect={() => setSel('full')}>Full day</Selector>
      </div>
    );
  },
};
```

`Selector/index.ts`:

```ts
export { Selector } from './Selector';
export type { SelectorProps } from './Selector';
```

- [ ] **Step 7: Export from barrel, typecheck, commit**

Append to `packages/design-system/src/index.ts`:

```ts
export * from './components/Selector';
```

Run: `npm run typecheck --workspace @thedot/design-system` → Expected: no errors.
Run: `npm run test --workspace @thedot/design-system` → Expected: all PASS.

```bash
git add packages/design-system/src/components/Selector packages/design-system/src/index.ts
git commit -m "feat(ds): add Selector (yellow-gradient fill, TDD)"
```

---

## Task 12: Dot and DotGrid

**Files:**
- Create: `packages/design-system/src/components/Dot/{Dot.tsx,Dot.module.css,Dot.stories.tsx,index.ts}`
- Create: `packages/design-system/src/components/DotGrid/{DotGrid.tsx,DotGrid.module.css,DotGrid.stories.tsx,index.ts}`
- Modify: `packages/design-system/src/index.ts`

- [ ] **Step 1: Create Dot.tsx**

```tsx
import styles from './Dot.module.css';

export interface DotProps { fill?: 'silver' | 'black' | 'yellow'; size?: number; className?: string }

export function Dot({ fill = 'silver', size = 48, className }: DotProps) {
  return <span aria-hidden className={[styles.dot, styles[fill], className].filter(Boolean).join(' ')} style={{ width: size, height: size }} />;
}
```

- [ ] **Step 2: Create Dot.module.css**

```css
.dot { display: inline-block; border-radius: var(--dot-radius-circle); }
.silver { background: var(--dot-grad-silver); }
.black { background: var(--dot-black); }
.yellow { background: radial-gradient(circle at 48% 42%, #daff00, #eefb9d 48%, #faf9f6 92%); }
```

- [ ] **Step 3: Create Dot.stories.tsx and index.ts**

`Dot.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Dot } from './Dot';

const meta: Meta<typeof Dot> = { title: 'Brand/Dot', component: Dot };
export default meta;
type Story = StoryObj<typeof Dot>;

export const Fills: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      <Dot fill="silver" /><Dot fill="black" /><Dot fill="yellow" />
    </div>
  ),
};
```

`Dot/index.ts`:

```ts
export { Dot } from './Dot';
export type { DotProps } from './Dot';
```

- [ ] **Step 4: Create DotGrid.tsx (CSS-generated device, deterministic scatter)**

```tsx
import { Dot } from '../Dot/Dot';
import styles from './DotGrid.module.css';

export interface DotGridProps { cols?: number; rows?: number; gap?: number; dotSize?: number; className?: string }

// Deterministic scatter: index-based, no randomness (stable renders for /design-sync screenshots).
function fillFor(i: number): 'silver' | 'black' | 'yellow' {
  if (i % 7 === 2) return 'yellow';
  if (i % 3 === 0) return 'black';
  return 'silver';
}

export function DotGrid({ cols = 8, rows = 6, gap = 16, dotSize = 44, className }: DotGridProps) {
  const total = cols * rows;
  return (
    <div
      className={[styles.grid, className].filter(Boolean).join(' ')}
      style={{ gridTemplateColumns: `repeat(${cols}, ${dotSize}px)`, gap }}
    >
      {Array.from({ length: total }, (_, i) => <Dot key={i} fill={fillFor(i)} size={dotSize} />)}
    </div>
  );
}
```

- [ ] **Step 5: Create DotGrid.module.css**

```css
.grid { display: grid; justify-content: center; }
```

- [ ] **Step 6: Create DotGrid.stories.tsx and index.ts**

`DotGrid.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { DotGrid } from './DotGrid';

const meta: Meta<typeof DotGrid> = { title: 'Brand/DotGrid', component: DotGrid };
export default meta;
type Story = StoryObj<typeof DotGrid>;

export const Signature: Story = { args: { cols: 8, rows: 6 } };
```

`DotGrid/index.ts`:

```ts
export { DotGrid } from './DotGrid';
export type { DotGridProps } from './DotGrid';
```

- [ ] **Step 7: Export both from barrel, typecheck, commit**

Append to `packages/design-system/src/index.ts`:

```ts
export * from './components/Dot';
export * from './components/DotGrid';
```

Run: `npm run typecheck --workspace @thedot/design-system` → Expected: no errors.

```bash
git add packages/design-system/src/components/Dot packages/design-system/src/components/DotGrid packages/design-system/src/index.ts
git commit -m "feat(ds): add Dot and DotGrid (CSS-generated signature device)"
```

---

## Task 13: Stripe and Arrow

**Files:**
- Create: `packages/design-system/src/components/Stripe/{Stripe.tsx,Stripe.module.css,Stripe.stories.tsx,index.ts}`
- Create: `packages/design-system/src/components/Arrow/{Arrow.tsx,Arrow.module.css,Arrow.stories.tsx,index.ts}`
- Modify: `packages/design-system/src/index.ts`

- [ ] **Step 1: Create Stripe.tsx (CSS repeating vertical-line ruler)**

```tsx
import styles from './Stripe.module.css';

export interface StripeProps { tone?: 'black' | 'grey'; height?: number; className?: string }

export function Stripe({ tone = 'black', height = 22, className }: StripeProps) {
  return <div aria-hidden className={[styles.stripe, styles[tone], className].filter(Boolean).join(' ')} style={{ height }} />;
}
```

- [ ] **Step 2: Create Stripe.module.css**

```css
.stripe { width: 100%; }
.black { background: repeating-linear-gradient(to right, var(--dot-black) 0 1px, transparent 1px 5px); }
.grey  { background: repeating-linear-gradient(to right, var(--dot-grey) 0 1px, transparent 1px 5px); }
```

- [ ] **Step 3: Create Stripe.stories.tsx and index.ts**

`Stripe.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Stripe } from './Stripe';

const meta: Meta<typeof Stripe> = { title: 'Brand/Stripe', component: Stripe, parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj<typeof Stripe>;

export const Divider: Story = { render: () => <div style={{ padding: 24 }}><Stripe /></div> };
```

`Stripe/index.ts`:

```ts
export { Stripe } from './Stripe';
export type { StripeProps } from './Stripe';
```

- [ ] **Step 4: Create Arrow.tsx (inline SVG, token-colored)**

```tsx
import styles from './Arrow.module.css';

export interface ArrowProps { direction?: 'up' | 'down' | 'left' | 'right'; size?: number; className?: string }

const rotation = { right: 0, down: 90, left: 180, up: 270 } as const;

export function Arrow({ direction = 'right', size = 48, className }: ArrowProps) {
  return (
    <svg
      className={[styles.arrow, className].filter(Boolean).join(' ')}
      width={size} height={size} viewBox="0 0 24 24" aria-hidden
      style={{ transform: `rotate(${rotation[direction]}deg)` }}
    >
      <path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
```

- [ ] **Step 5: Create Arrow.module.css**

```css
.arrow { color: var(--dot-black); }
```

- [ ] **Step 6: Create Arrow.stories.tsx and index.ts**

`Arrow.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Arrow } from './Arrow';

const meta: Meta<typeof Arrow> = { title: 'Brand/Arrow', component: Arrow };
export default meta;
type Story = StoryObj<typeof Arrow>;

export const Directions: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      <Arrow direction="right" /><Arrow direction="down" /><Arrow direction="left" /><Arrow direction="up" />
    </div>
  ),
};
```

`Arrow/index.ts`:

```ts
export { Arrow } from './Arrow';
export type { ArrowProps } from './Arrow';
```

- [ ] **Step 7: Export both from barrel, typecheck, commit**

Append to `packages/design-system/src/index.ts`:

```ts
export * from './components/Stripe';
export * from './components/Arrow';
```

Run: `npm run typecheck --workspace @thedot/design-system` → Expected: no errors.

```bash
git add packages/design-system/src/components/Stripe packages/design-system/src/components/Arrow packages/design-system/src/index.ts
git commit -m "feat(ds): add Stripe and Arrow brand elements"
```

---

## Task 14: Assets export + full green gates

**Files:**
- Modify: `packages/design-system/src/index.ts`
- Create: `packages/design-system/src/assets/Assets.stories.tsx`

- [ ] **Step 1: Export asset paths from the barrel**

Append to `packages/design-system/src/index.ts`:

```ts
export * from './assets';
```

- [ ] **Step 2: Add an Assets story (visual check of the Figma vectors)**

Create `packages/design-system/src/assets/Assets.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import logo from './main-logo.svg';
import dotPattern from './dot-pattern.svg';

const meta: Meta = { title: 'Brand/Assets' };
export default meta;
type Story = StoryObj;

export const Vectors: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 24 }}>
      <img src={logo} alt="The Dot logo" style={{ height: 60 }} />
      <img src={dotPattern} alt="Dot pattern" style={{ width: 320 }} />
    </div>
  ),
};
```

Note: Vite (Storybook) resolves `import x from './*.svg'` to a URL. This story is Storybook-only and is not part of the `tsup` entry, so it does not affect the bundle.

- [ ] **Step 3: Run every gate**

Run: `npm run test --workspace @thedot/design-system` → Expected: all PASS.
Run: `npm run typecheck --workspace @thedot/design-system` → Expected: no errors.
Run: `npm run build --workspace @thedot/design-system` → Expected: `dist/index.js`, `dist/index.d.ts`, `dist/index.css`, `dist/assets/*.svg` all present.
Run: `npm run build-storybook --workspace @thedot/design-system` → Expected: `storybook-static/` builds with all 13 component stories.

- [ ] **Step 4: Verify the barrel exports every component**

Run:
```bash
grep -c "export \* from './components" packages/design-system/src/index.ts
```
Expected: `13`.

- [ ] **Step 5: Verify the site build STILL works (regression gate)**

Run from repo root: `npm run build`
Expected: `next build` succeeds. If not, STOP and report.

- [ ] **Step 6: Commit**

```bash
git add packages/design-system/src/index.ts packages/design-system/src/assets/Assets.stories.tsx
git commit -m "feat(ds): export assets and finalize green build (13 components)"
```

---

## Task 15: README + `/design-sync` handoff prep

**Files:**
- Create: `packages/design-system/README.md`

- [ ] **Step 1: Write a short package README**

Create `packages/design-system/README.md`:

```markdown
# @thedot/design-system

The Dot Creative's component library. 13 foundation components + tokens, built from the
Figma "The Dot Styleguide" palette and the site's type/gradient system.

## Use
```ts
import '@thedot/design-system/styles.css';
import { Button, Card, DotGrid } from '@thedot/design-system';
```
Load the Adobe Typekit font kit in your document head:
`<link rel="stylesheet" href="https://use.typekit.net/gac6jnd.css">`

## Develop
- `npm run storybook` — component gallery
- `npm run build` — emit `dist/`
- `npm run test` — Vitest (interactive components)

## Tokens
All styling flows from `src/tokens/tokens.css` (`var(--dot-*)`). Six brand colors:
black `#35332f`, cream `#faf9f6`, yellow `#daff00`, white `#ffffff`, grey `#7a776f`, graphite `#47453f`.
```

- [ ] **Step 2: Commit**

```bash
git add packages/design-system/README.md
git commit -m "docs(ds): add package README"
```

- [ ] **Step 3: Hand off to `/design-sync` (separate, user-invoked step)**

Do NOT run automatically. When the build and Storybook are green, the user runs `/design-sync`
in this repo. It will detect the **storybook shape** (`.storybook/main.ts` present), create a new
Claude Design project, screenshot each story, verify fidelity, and upload the bundle. During that
flow, author `.design-sync/conventions.md` per spec §6 (no wrapper beyond the `dot-root` class +
`styles.css` import + Typekit link; style via `var(--dot-*)`; no utility classes) and validate
every token/class name against `dist/` before committing.

---

## Notes for the executor

- **Never modify the live site** (`src/**`, `app/**` at repo root). Only `package.json` (workspaces key) and everything under `packages/design-system/`.
- If `npm run build` (site) ever fails after the workspaces change, the fix is almost always ensuring the workspace package is `"private": true` and not hoisting a conflicting React — STOP and report before hacking around it.
- CSS Modules class names are hashed at build; always reference them through the imported `styles` object, never as string literals.
- **Storybook types:** stories import `Meta`/`StoryObj` from `@storybook/react-vite` (valid in Storybook 8.3+). If a version doesn't re-export them, add `@storybook/react` to devDependencies and import the types from there instead — no other change needed.
- The Figma personal access token used to export assets must be **rotated** by the user (out of scope for these tasks).
```
