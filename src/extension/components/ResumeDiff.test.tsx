import React from 'react';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResumeDiff } from './ResumeDiff';

describe('resume changes preview', () => {
  test('renders numbered additions and removals as escaped text', () => {
    const html = renderToStaticMarkup(
      <ResumeDiff original={'Name\nOld role'} tailored={'Name\n<script>bad()</script>'} />
    );
    expect(html).toContain('+1 added');
    expect(html).toContain('−1 removed');
    expect(html).toContain('Original line');
    expect(html).toContain('Tailored line');
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
  test('explains unavailable originals and unchanged resumes', () => {
    expect(renderToStaticMarkup(<ResumeDiff tailored="Resume" />)).toContain(
      'No original resume is available'
    );
    expect(renderToStaticMarkup(<ResumeDiff original="Resume" tailored="Resume" />)).toContain(
      'No text changes'
    );
  });
});
