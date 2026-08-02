import { describe, it, expect } from 'vitest';
import { userInitials, userDisplay, userTitle, userParts } from './osUser';

describe('osUser', () => {
  it('splits on every separator shape', () => {
    expect(userParts('alex.chen')).toEqual(['alex', 'chen']);
    expect(userParts('alex-chen')).toEqual(['alex', 'chen']);
    expect(userParts('alex_chen')).toEqual(['alex', 'chen']);
    expect(userParts('Alex Chen')).toEqual(['Alex', 'Chen']);
  });

  it('takes one letter from each of the first two parts', () => {
    expect(userInitials('alex.chen')).toBe('AC');
    expect(userInitials('alex.b.chen')).toBe('AB');
  });

  it('falls back to the first two characters of a single-word name', () => {
    expect(userInitials('alex')).toBe('AL');
    expect(userInitials('r')).toBe('R');
  });

  it('never renders an empty avatar', () => {
    expect(userInitials('')).toBe('?');
    expect(userInitials('___')).toBe('?');
  });

  it('pascal-cases the display name', () => {
    expect(userDisplay('alex.chen')).toBe('Alex Chen');
    expect(userDisplay('alex')).toBe('Alex');
    expect(userDisplay('')).toBe('Unknown');
  });

  it('titles carry both the readable name and the raw login', () => {
    expect(userTitle('alex.chen')).toBe('Alex Chen · alex.chen (system account)');
    expect(userTitle('')).toBe('Signed in to this machine');
  });
});
