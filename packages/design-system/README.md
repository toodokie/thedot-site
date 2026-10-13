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
