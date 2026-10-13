'use client';

import React, { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { StyleRegistry, createStyleRegistry } from 'styled-jsx';

/**
 * Hoists styled-jsx styles into <head> during SSR (the official Next.js
 * app-router pattern). Without this, styled-jsx injects each component's
 * <style> inline in the body, AFTER its markup, so the browser paints the
 * content with only global styles first and then re-styles — a visible
 * "broken layout" flash on load. Wrapping the app in this registry emits the
 * collected styles via useServerInsertedHTML so they arrive in <head>.
 */
export default function StyledJsxRegistry({ children }: { children: React.ReactNode }) {
  const [jsxStyleRegistry] = useState(() => createStyleRegistry());

  useServerInsertedHTML(() => {
    const styles = jsxStyleRegistry.styles();
    jsxStyleRegistry.flush();
    return <>{styles}</>;
  });

  return <StyleRegistry registry={jsxStyleRegistry}>{children}</StyleRegistry>;
}
