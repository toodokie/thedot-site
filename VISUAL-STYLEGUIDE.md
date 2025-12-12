# The Dot Creative - Visual Style Guide

**Design Philosophy**: Performance, beautifully engineered.
Clean, minimal aesthetic with strategic use of neon yellow accent. Typography-first design with smooth, elegant transitions.

---

## 🎨 Brand Colors

### Primary Palette
```css
--background: #faf9f6       /* Cream/off-white - primary background */
--foreground: #35332f       /* Dark charcoal - primary text */
--highlight-color: #daff00  /* Neon yellow-green - brand accent */
--dim-grey: #888            /* Medium grey - subdued elements */
```

### Extended Neutrals
```css
#7a776f     /* Grey-2: borders, subdued text */
#555        /* Dark grey: visited links */
#ccc        /* Light grey: form borders */
#ddd        /* Divider grey */
#eee        /* Very light grey: section dividers */
#f0f0f0     /* Off-white: subtle backgrounds */
#f8f8f6     /* Warm off-white: alternate backgrounds */
#fff        /* Pure white: form backgrounds */
```

### Highlight Variations (with transparency)
```css
#daff00a1   /* 63% opacity */
#daff00cc   /* 80% opacity */
#daff0087   /* 53% opacity */
#daff00cf   /* 81% opacity */
```

### Semantic Colors
```css
/* Success states */
background: #c6f6d5     /* Light green */
color: #276749          /* Dark green text */
border: #9ae6b4         /* Green border */

/* Error states */
background: #fed7d7     /* Light red */
color: #742a2a          /* Dark red text */
border: #fc8181         /* Red border */
```

---

## 🔤 Typography

### Font Families
```css
/* Primary (body text, UI, forms) */
font-family: 'futura-pt', Arial, Helvetica, sans-serif;

/* Display (large headings) */
font-family: 'futura-pt', sans-serif;

/* Subheadings & body emphasis */
font-family: 'ff-real-text-pro', sans-serif;
```

### Type Scale - Responsive Body Text
```css
body {
  font-size: 16px;  /* Mobile default */
}

@media (min-width: 1000px) {
  body {
    font-size: 18px;
  }
}

@media (min-width: 1240px) {
  body {
    font-size: 20px;
  }
}
```

### Heading Scale - Fluid Typography
```css
h1 {
  font-family: 'futura-pt', sans-serif;
  font-size: clamp(3rem, 8vw, 5rem);     /* 48px - 80px */
  font-weight: 400;
  line-height: 1.1;
}

h2 {
  font-family: 'futura-pt', sans-serif;
  font-size: clamp(2.5rem, 6vw, 4rem);   /* 40px - 64px */
  font-weight: 200;
  line-height: 1.2;
}

h3 {
  font-family: 'ff-real-text-pro', sans-serif;
  font-size: clamp(1.5rem, 4vw, 2.375rem); /* 24px - 38px */
  font-weight: 300;
  line-height: 1.3;
}

h4 {
  font-family: 'ff-real-text-pro', sans-serif;
  font-size: clamp(1.25rem, 3vw, 1.875rem); /* 20px - 30px */
  font-weight: 300;
  line-height: 1.4;
}
```

### Font Weights
```
200 - Ultra-light   → Body copy, list items, h2
300 - Light         → h3, h4, form fields, labels
400 - Regular       → h1, form section titles, emphasis
500 - Medium        → Strong elements, bold within light text
600 - Semibold      → Buttons (rare use)
700 - Bold          → Special emphasis only (very rare)
```

### Letter Spacing
```css
letter-spacing: -0.01em  /* Large display text only */
```

### Line Heights
```
h1: 1.1
h2: 1.2
h3: 1.3
h4: 1.4
body: 1.6
```

---

## 🔗 Links

### Content Links (Default)
```css
a {
  color: #35332f;           /* Foreground */
  text-decoration: underline;
}

a:hover {
  color: #888;              /* Dim grey */
  text-decoration: underline;
}

a:visited {
  color: #555;              /* Dark grey */
  text-decoration: underline;
}
```

### Navigation Links (No Underline)
```css
.nav-link,
.mobile-nav-link {
  text-decoration: none !important;
}

.nav-link:hover,
.mobile-nav-link:hover {
  text-decoration: none !important;
  /* Usually color change or transform instead */
}

.nav-link:visited,
.mobile-nav-link:visited {
  text-decoration: none !important;
}
```

---

## 📝 Form Styling

Reference: `wf-form-Website-Form` in [ProjectBrief.tsx](src/components/ProjectBrief.tsx)

### Form Section Headers
```css
.dot_forms_title.sites {
  color: var(--foreground);           /* #35332f */
  text-align: left;
  margin-top: 2rem;
  margin-bottom: 30px;
  font-family: futura-pt, sans-serif;
  font-size: 1.8rem;
  font-weight: 400;
  line-height: 1.3;
}

@media (max-width: 768px) {
  .dot_forms_title.sites {
    font-size: 1.5rem;
  }
}
```

### Form Labels
```css
.dot_field_label {
  color: var(--foreground);
  display: block;
  margin-top: 6px;
  margin-bottom: 10px;
  padding-left: 0;
  padding-right: 0;
  font-family: futura-pt, sans-serif;
  font-size: 1.125rem;                /* 18px */
  font-weight: 300;
  line-height: 1.3;
}

@media (max-width: 768px) {
  .dot_field_label {
    text-align: left;
    font-weight: 200 !important;
    font-size: 1rem !important;       /* 16px */
  }
}
```

### Text Inputs (Short Fields - Name, Email)
```css
.text-field-3 {
  color: var(--foreground);
  width: 60%;                         /* Desktop: 60% */
  height: 60px;
  margin-top: 10px;
  margin-bottom: 20px;
  padding: 10px 15px;
  font-family: futura-pt, sans-serif;
  font-size: 1.4rem;
  font-weight: 300;
  line-height: 1.3;
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: #fff;
}

@media (max-width: 768px) {
  .text-field-3 {
    width: 100%;                      /* Mobile: full width */
    max-width: 100%;
    box-sizing: border-box;
    padding: 12px 16px;
    margin: 0;
  }
}
```

### Textareas (Medium Fields)
```css
.text-filed-3 {                       /* Note: typo is intentional */
  color: var(--foreground);
  width: 80%;                         /* Desktop: 80% */
  height: 60px;
  margin-top: 10px;
  margin-bottom: 20px;
  padding: 10px 15px;
  font-family: futura-pt, sans-serif;
  font-size: 1.4rem;
  font-weight: 300;
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: #fff;
  resize: vertical;                   /* Allow vertical resize */
}

@media (max-width: 768px) {
  .text-filed-3 {
    width: 100%;                      /* Mobile: full width */
    max-width: 100%;
    box-sizing: border-box;
    padding: 12px 16px;
    margin: 0;
  }
}
```

### Large Textareas
```css
.text-area-field-4 {
  color: var(--foreground);
  width: 100%;                        /* Always full width */
  min-height: 120px;
  margin-top: 10px;
  margin-bottom: 30px;
  padding: 10px 15px;
  font-family: futura-pt, sans-serif;
  font-size: 1.4rem;
  font-weight: 300;
  line-height: 1.3;
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: #fff;
  resize: vertical;
}
```

### Radio Buttons (Vertical Stack)
```css
.radio-button-field {
  color: var(--foreground);
  margin-bottom: 15px;                /* Stacked vertically */
  font-family: futura-pt, sans-serif;
  font-size: 1.125rem;
  font-weight: 300;
  line-height: 1.3;
}

.radio-button-field input[type="radio"] {
  margin-right: 10px;
}
```

### Checkboxes
```css
.checkbox-field {
  color: var(--foreground);
  margin-bottom: 10px;
  font-family: futura-pt, sans-serif;
  font-size: 1.125rem;
  font-weight: 300;
  line-height: 1.3;
}

.checkbox-field input[type="checkbox"] {
  margin-right: 10px;
}
```

### Form Container (Mobile Responsive)
```css
@media (max-width: 768px) {
  .form-container.w-container {
    padding-left: 15px;
    padding-right: 15px;
    max-width: 100%;
  }

  .form-container-web-section.w-container {
    padding-left: 15px;
    padding-right: 15px;
    max-width: 100%;
  }

  .website-form {
    width: 100%;
    max-width: 100%;
  }
}
```

### Success & Error Messages
```css
.success-message {
  padding: 16px;
  border-radius: 6px;
  margin-top: 20px;
  text-align: center;
  background-color: #c6f6d5;
  color: #276749;
  border: 1px solid #9ae6b4;
}

.error-message {
  padding: 16px;
  border-radius: 6px;
  margin-top: 20px;
  text-align: center;
  background-color: #fed7d7;
  color: #742a2a;
  border: 1px solid #fc8181;
}
```

### Form Field Summary

| Field Type | Class | Desktop Width | Mobile Width | Font Size |
|------------|-------|---------------|--------------|-----------|
| Short input (name, email) | `.text-field-3` | 60% | 100% | 1.4rem |
| Medium textarea | `.text-filed-3` | 80% | 100% | 1.4rem |
| Large textarea | `.text-area-field-4` | 100% | 100% | 1.4rem |
| Label | `.dot_field_label` | N/A | N/A | 1.125rem → 1rem |
| Section title | `.dot_forms_title.sites` | N/A | N/A | 1.8rem → 1.5rem |
| Radio/Checkbox | `.radio-button-field` | N/A | N/A | 1.125rem |

---

## 🎭 Effects & Visual Elements

### Shadows
```css
/* Subtle elevation (cards, containers) */
box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06);

/* Deeper elevation (modals, dropdowns) */
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);

/* Focus glow */
box-shadow: 0 0 0 3px rgba(53, 51, 47, 0.1);  /* Charcoal tint */
```

### Borders
```css
/* Subtle dividers */
border: 1px solid #e2e8f0;
border: 1px solid #ddd;
border: 1px solid #eee;
border: 1px solid #ccc;         /* Form inputs */

/* Defined borders */
border: 1px solid #7a776f;      /* Medium grey */
border: 1px solid #35332f;      /* Dark charcoal */

/* Brand accent borders */
border: 1px solid #daff00;      /* Standard */
border: 2px solid #daff00;      /* Emphasis */
border: 3px solid #daff00;      /* Strong emphasis */
border: 4px solid #daff00;      /* Very strong */
```

### Border Radius
```
4px     → Subtle (form inputs, sliders, small elements)
6px     → Standard (buttons, messages, cards)
12px    → Large containers
24px    → XL containers, bottom-only mobile nav
50%     → Circular elements (avatars, dots)
```

---

## ✨ Animations & Transitions

### Timing Functions
```css
/* Smooth & elegant (most common) */
cubic-bezier(0.25, 0.46, 0.45, 0.94)

/* Snappy UI interactions */
cubic-bezier(0.4, 0, 0.2, 1)

/* Simple easing */
ease, ease-out, ease-in
```

### Duration Standards
```
0.2s  → Fast interactions (hover, focus, border-color)
0.3s  → Standard UI (opacity, simple transforms)
0.5s  → Medium transforms
0.6s  → Page transitions (height changes)
0.8s  → Elegant page transitions (smooth fades)
```

### Common Transition Patterns
```css
/* Interactive elements (hover, focus) */
transition: background-color 0.2s;
transition: border-color 0.2s;
transition: color 0.2s;

/* Transforms */
transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

/* Smooth fades */
transition: opacity 0.3s ease;
transition: opacity 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);

/* Layout changes */
transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
transition: height 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
transition: width 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);

/* Combined */
transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1),
            background-color 0.3s ease;
```

### Staggered Animations
```css
.animate-on-scroll:nth-child(1) { transition-delay: 0s; }
.animate-on-scroll:nth-child(2) { transition-delay: 0.2s; }
.animate-on-scroll:nth-child(3) { transition-delay: 0.4s; }
.animate-on-scroll:nth-child(4) { transition-delay: 0.6s; }
/* Continue pattern: +0.2s per item */
```

---

## 🎨 Gradients

### Brand Gradients
```css
/* Subtle yellow glow (hero sections) */
background-image: radial-gradient(
  circle farthest-corner at 100% 0%,
  #daff00cf,
  #eefb9dbd 34%,
  #faf9f6 53%
);

/* Radial fade from edge */
background-image: radial-gradient(
  circle farthest-corner at 100% 50%,
  #daff00a1,
  #faf9f6
);

/* Soft diagonal */
background: linear-gradient(135deg, #daff00 0%, #faf9f6 100%);

/* Subtle vertical */
background-image: linear-gradient(to bottom, #faf9f6, #daff00a3);

/* Double layer (background + image) */
background-color: #daff00ad;
background-image: radial-gradient(
  circle farthest-corner at 50% 50%,
  #daff00cc,
  var(--raw-white)
);
```

---

## 📐 Spacing System

### Vertical Spacing Hierarchy
```
60px  → Major page sections (hero to form, section breaks)
40px  → Between form sections, major containers
30px  → Section padding-bottom, form header bottom
25px  → Between individual form fields
20px  → Input bottom margin, button top margin
15px  → Radio/checkbox bottom margin
10px  → Label bottom margin, input top margin
8px   → Small gaps (label to input)
6px   → Label top margin
```

### Container Padding
```css
/* Desktop */
padding: 40px;                    /* Standard containers */
padding: 100px 20px 50px;         /* Page sections (100px for header) */
padding: 2.5rem;                  /* 40px - standard horizontal */

/* Mobile (max-width: 768px) */
padding: 30px 20px;               /* Standard containers */
padding: 80px 15px 40px;          /* Page sections (80px for header) */
padding: 15px;                    /* Tight mobile spacing */
```

### Max-Width Standards
```css
max-width: 120rem;                /* 1920px - main page container */
max-width: 800px;                 /* Forms, centered content blocks */
```

---

## 📱 Responsive Breakpoints

```css
/* Mobile first approach */

/* Mobile */
@media (max-width: 768px) { }

/* Small tablet */
@media (min-width: 769px) { }

/* Medium Desktop */
@media (min-width: 1000px) { }

/* Large Desktop */
@media (min-width: 1240px) { }

/* Alternative mobile-first queries */
@media (width <= 768px) { }
@media (width <= 999px) { }
```

---

## 🚫 What NOT to Do

### ❌ Colors
- Use colors outside the brand palette
- Add blues, purples, or other accent colors
- Use black (#000) instead of charcoal (#35332f)
- Mix different greys randomly - stick to the palette

### ❌ Typography
- Use bold (700) liberally - this is a light brand
- Use fonts other than futura-pt and ff-real-text-pro
- Create fixed pixel sizes - use responsive scales
- Forget letter-spacing on large display text

### ❌ Forms
- Set fixed pixel widths on inputs (e.g., `width: 300px`)
- Create forms wider than 800px on desktop
- Use inline labels beside inputs (except radio/checkbox)
- Make full-width inputs on desktop - follow 60%/80% pattern
- Use different border colors - stick to #ccc
- Add focus styles with blues - use charcoal

### ❌ Layout
- Create edge-to-edge forms without containers
- Center buttons without context
- Use random spacing values - follow the hierarchy
- Mix up the responsive breakpoints

### ❌ Effects
- Overuse shadows - keep it minimal
- Add heavy animations - this is an elegant brand
- Use instant transitions - always define timing
- Create jarring color changes

---

## ✅ Best Practices

### Colors
- Use cream (#faf9f6) for backgrounds
- Use charcoal (#35332f) for text
- Use neon yellow (#daff00) **strategically** as accent
- Use greys from the palette for borders and subdued text

### Typography
- Keep it light (200-400 weight)
- Use fluid typography with clamp()
- Maintain consistent line heights
- Let breathing room exist - this isn't a dense design

### Forms
- Follow the width hierarchy: 60% → 80% → 100%
- Stack radio buttons vertically (not horizontal)
- Use consistent 1.4rem for all input text
- Maintain proper spacing between fields
- Always go full-width on mobile

### Layout
- Center content containers with `margin: 0 auto`
- Use max-width constraints (800px forms, 120rem page)
- Account for fixed header (100px/80px top padding)
- Let forms breathe - generous spacing

### Effects
- Use subtle shadows for elevation
- Smooth transitions (0.2s - 0.8s)
- Elegant easing functions
- Stagger animations when appropriate

---

## 📚 Key Reference Files

- **Main global styles**: `src/app/styles/globals.css`
- **Form styles**: Lines 5627-5774 in `globals.css`
- **Form component**: `src/components/ProjectBrief.tsx`
- **Color variables**: Lines 4-10 in `globals.css`

---

**Remember**: This is a clean, minimal, typography-first brand with strategic use of neon yellow. Keep it light, elegant, and spacious. Performance, beautifully engineered. 🚀
