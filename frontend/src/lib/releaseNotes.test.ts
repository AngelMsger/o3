import { describe, it, expect } from 'vitest';
import { parseReleaseNotes, parseInline } from './releaseNotes';
import type { Block } from './releaseNotes';

/* A verbatim `gh release create --generate-notes` body — the shape this parser
 * exists to render. */
const GENERATED = `## What's Changed
* fix(dist): set GH_REPO so the release job works by @AngelMsger in https://github.com/AngelMsger/o3/pull/12
* feat: add the update check by @someone-else in https://github.com/AngelMsger/o3/pull/13

## New Contributors
* @someone-else made their first contribution in https://github.com/AngelMsger/o3/pull/13

**Full Changelog**: https://github.com/AngelMsger/o3/compare/v0.1.0...v0.2.0`;

describe('parseReleaseNotes', () => {
  it('parses a generated release body', () => {
    const blocks = parseReleaseNotes(GENERATED);
    expect(blocks.map((b) => b.t)).toEqual(['h', 'ul', 'h', 'ul', 'p']);

    const [h1, list] = blocks as [Block & { t: 'h' }, Block & { t: 'ul' }];
    expect(h1.level).toBe(2);
    expect(h1.c).toEqual([{ t: 'text', v: "What's Changed" }]);

    // Consecutive bullets coalesce into one list.
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toContainEqual({
      t: 'link',
      v: '@AngelMsger',
      href: 'https://github.com/AngelMsger',
    });
    expect(list.items[0]).toContainEqual({
      t: 'link',
      v: 'https://github.com/AngelMsger/o3/pull/12',
      href: 'https://github.com/AngelMsger/o3/pull/12',
    });

    const full = blocks[4] as Block & { t: 'p' };
    expect(full.c[0]).toEqual({ t: 'strong', v: 'Full Changelog' });
  });

  it('coalesces consecutive bullets but splits across a blank line', () => {
    const blocks = parseReleaseNotes('* a\n* b\n\n* c');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ t: 'ul' });
    expect((blocks[0] as Block & { t: 'ul' }).items).toHaveLength(2);
    expect((blocks[1] as Block & { t: 'ul' }).items).toHaveLength(1);
  });

  it('accepts both bullet markers and h1/h2/h3 headings', () => {
    expect(parseReleaseNotes('- dash')).toMatchObject([{ t: 'ul' }]);
    expect(parseReleaseNotes('# one')).toMatchObject([{ t: 'h', level: 2 }]);
    expect(parseReleaseNotes('### three')).toMatchObject([{ t: 'h', level: 3 }]);
  });

  it('joins soft-wrapped paragraph lines with a space', () => {
    const blocks = parseReleaseNotes('one\ntwo');
    expect(blocks).toEqual([{ t: 'p', c: [{ t: 'text', v: 'one two' }] }]);
  });

  it('returns nothing for an empty body', () => {
    expect(parseReleaseNotes('')).toEqual([]);
    expect(parseReleaseNotes('   \n\n  ')).toEqual([]);
    expect(parseReleaseNotes(undefined as unknown as string)).toEqual([]);
  });
});

describe('parseInline', () => {
  it('parses bold, emphasis, code and explicit links', () => {
    expect(parseInline('**b**')).toEqual([{ t: 'strong', v: 'b' }]);
    expect(parseInline('__b__')).toEqual([{ t: 'strong', v: 'b' }]);
    expect(parseInline('*i*')).toEqual([{ t: 'em', v: 'i' }]);
    expect(parseInline('`c`')).toEqual([{ t: 'code', v: 'c' }]);
    expect(parseInline('[o3](https://example.com)')).toEqual([
      { t: 'link', v: 'o3', href: 'https://example.com' },
    ]);
  });

  it('keeps ** inside a code span literal', () => {
    expect(parseInline('`**not bold**`')).toEqual([{ t: 'code', v: '**not bold**' }]);
  });

  it('autolinks bare URLs and leaves trailing punctuation outside the link', () => {
    expect(parseInline('see https://example.com/a.')).toEqual([
      { t: 'text', v: 'see ' },
      { t: 'link', v: 'https://example.com/a', href: 'https://example.com/a' },
      { t: 'text', v: '.' },
    ]);
    expect(parseInline('(https://example.com/a)')).toEqual([
      { t: 'text', v: '(' },
      { t: 'link', v: 'https://example.com/a', href: 'https://example.com/a' },
      { t: 'text', v: ')' },
    ]);
  });

  it('links @mentions to their GitHub profile', () => {
    expect(parseInline('by @octo-cat')).toEqual([
      { t: 'text', v: 'by ' },
      { t: 'link', v: '@octo-cat', href: 'https://github.com/octo-cat' },
    ]);
    // An email-ish string is not a mention.
    expect(parseInline('a@b')).toEqual([{ t: 'text', v: 'a@b' }]);
  });

  // The renderer hands every href to BrowserOpenURL, so a non-http scheme must
  // never survive parsing as a link.
  it('refuses to emit a link for a non-http scheme', () => {
    expect(parseInline('[click](javascript:alert(1))')).toEqual([
      { t: 'text', v: '[click](javascript:alert(1))' },
    ]);
    expect(parseInline('[x](file:///etc/passwd)')).toEqual([
      { t: 'text', v: '[x](file:///etc/passwd)' },
    ]);
    expect(parseInline('[x](/relative)')).toEqual([{ t: 'text', v: '[x](/relative)' }]);
  });

  it('merges adjacent literal text', () => {
    expect(parseInline('plain text')).toEqual([{ t: 'text', v: 'plain text' }]);
  });
});
