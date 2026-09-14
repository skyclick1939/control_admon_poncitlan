import { describe, expect, it } from 'vitest';
import { escapeHtml, setText } from './escape';

describe('escapeHtml', () => {
  it('neutralizes a script tag', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's fine")).toBe('it&#39;s fine');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('neutralizes an img onerror payload', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('leaves normal text unchanged', () => {
    expect(escapeHtml('Cuota mensual de mantenimiento')).toBe(
      'Cuota mensual de mantenimiento',
    );
  });
});

describe('setText', () => {
  it('assigns raw text to textContent, relying on the DOM to never interpret it as markup', () => {
    const element = { textContent: null as string | null };

    setText(element, '<script>alert(1)</script>');

    expect(element.textContent).toBe('<script>alert(1)</script>');
  });
});
