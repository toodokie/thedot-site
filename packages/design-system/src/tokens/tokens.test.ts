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
