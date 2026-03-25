import { describe, it, expect } from 'vitest';
import { formatTime, guessArtistFromTitle } from './utils.js';

describe('formatTime', () => {
  it('formats zero seconds', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(30)).toBe('0:30');
    expect(formatTime(59)).toBe('0:59');
  });

  it('pads single-digit seconds with zero', () => {
    expect(formatTime(61)).toBe('1:01');
    expect(formatTime(609)).toBe('10:09');
  });

  it('formats minutes correctly', () => {
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(120)).toBe('2:00');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('handles large values (over an hour)', () => {
    expect(formatTime(3600)).toBe('60:00');
    expect(formatTime(3661)).toBe('61:01');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(1.9)).toBe('0:01');
    expect(formatTime(61.7)).toBe('1:01');
  });
});

describe('guessArtistFromTitle', () => {
  it('extracts artist from "Artist - Album (Full Album)" format', () => {
    expect(guessArtistFromTitle('Pink Floyd - The Dark Side of the Moon (Full Album)'))
      .toBe('Pink Floyd');
  });

  it('extracts artist from "Artist – Album Full Album" with en-dash', () => {
    expect(guessArtistFromTitle('Radiohead – OK Computer Full Album'))
      .toBe('Radiohead');
  });

  it('extracts artist from "Artist — Album" with em-dash', () => {
    expect(guessArtistFromTitle('Miles Davis — Kind of Blue'))
      .toBe('Miles Davis');
  });

  it('extracts artist from "Artist - Album" without full album keyword', () => {
    expect(guessArtistFromTitle('Led Zeppelin - IV'))
      .toBe('Led Zeppelin');
  });

  it('extracts artist from "Artist Full Album" without dash', () => {
    expect(guessArtistFromTitle('Nirvana Nevermind Full Album'))
      .toBe('Nirvana Nevermind');
  });

  it('falls back to first two words when no pattern matches', () => {
    expect(guessArtistFromTitle('SomeBand'))
      .toBe('SomeBand');
  });

  it('trims whitespace from extracted artist', () => {
    expect(guessArtistFromTitle('  Daft Punk  - Discovery'))
      .toBe('Daft Punk');
  });
});
