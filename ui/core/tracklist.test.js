import { describe, it, expect, vi } from 'vitest';

vi.mock('../config.js', () => ({ CONFIG: { YOUTUBE_API_KEY: 'test' } }));
vi.mock('./player.js', () => ({ seekTo: vi.fn() }));

import { parseTimestamps } from './tracklist.js';

describe('parseTimestamps', () => {
  it('returns empty array for null/undefined input', () => {
    expect(parseTimestamps(null)).toEqual([]);
    expect(parseTimestamps(undefined)).toEqual([]);
    expect(parseTimestamps('')).toEqual([]);
  });

  it('parses MM:SS timestamps from description', () => {
    const text = `
0:00 First Track
3:45 Second Track
7:12 Third Track
    `;
    const tracks = parseTimestamps(text);
    expect(tracks).toHaveLength(3);
    expect(tracks[0]).toEqual({ time: 0, name: 'First Track' });
    expect(tracks[1]).toEqual({ time: 225, name: 'Second Track' });
    expect(tracks[2]).toEqual({ time: 432, name: 'Third Track' });
  });

  it('parses HH:MM:SS timestamps', () => {
    const text = `
0:00:00 Track One
0:05:30 Track Two
1:02:15 Track Three
    `;
    const tracks = parseTimestamps(text);
    expect(tracks).toHaveLength(3);
    expect(tracks[0]).toEqual({ time: 0, name: 'Track One' });
    expect(tracks[1]).toEqual({ time: 330, name: 'Track Two' });
    expect(tracks[2]).toEqual({ time: 3735, name: 'Track Three' });
  });

  it('requires at least 3 tracks', () => {
    const text = `
0:00 Only One
3:00 Only Two
    `;
    expect(parseTimestamps(text)).toEqual([]);
  });

  it('sorts tracks by time', () => {
    const text = `
7:00 Third
0:00 First
3:30 Second
    `;
    const tracks = parseTimestamps(text);
    expect(tracks[0].name).toBe('First');
    expect(tracks[1].name).toBe('Second');
    expect(tracks[2].name).toBe('Third');
  });

  it('strips leading separators from track names', () => {
    const text = `
0:00 - Track A
3:00 | Track B
6:00 · Track C
    `;
    const tracks = parseTimestamps(text);
    expect(tracks[0].name).toBe('Track A');
    expect(tracks[1].name).toBe('Track B');
    expect(tracks[2].name).toBe('Track C');
  });

  it('strips trailing separators from track names', () => {
    const text = `
0:00 Track A -
3:00 Track B |
6:00 Track C .
    `;
    const tracks = parseTimestamps(text);
    expect(tracks[0].name).toBe('Track A');
    expect(tracks[1].name).toBe('Track B');
    expect(tracks[2].name).toBe('Track C');
  });

  it('handles numbered track lists', () => {
    const text = `
0:00 1. Opening
4:00 2. Middle
8:00 3. Closing
    `;
    const tracks = parseTimestamps(text);
    expect(tracks[0].name).toBe('Opening');
    expect(tracks[1].name).toBe('Middle');
    expect(tracks[2].name).toBe('Closing');
  });

  it('skips lines without timestamps', () => {
    const text = `
Album: Great Album
Artist: Great Artist
0:00 Track 1
3:00 Track 2
6:00 Track 3
Released 2020
    `;
    const tracks = parseTimestamps(text);
    expect(tracks).toHaveLength(3);
  });

  it('rejects track names that are too long (>= 200 chars)', () => {
    const longName = 'A'.repeat(200);
    const text = `
0:00 ${longName}
3:00 Normal Track
6:00 Another Track
9:00 Third Track
    `;
    const tracks = parseTimestamps(text);
    expect(tracks.every(t => t.name.length < 200)).toBe(true);
  });

  it('handles timestamps in parentheses', () => {
    const text = `
(0:00) Opening Act
(4:30) Main Event
(9:15) Finale
    `;
    const tracks = parseTimestamps(text);
    expect(tracks).toHaveLength(3);
    expect(tracks[0]).toEqual({ time: 0, name: 'Opening Act' });
  });

  it('handles real-world YouTube description format', () => {
    const text = `Pink Floyd - The Dark Side of the Moon (1973)

Tracklist:
00:00 Speak to Me
01:30 Breathe
04:12 On the Run
07:44 Time
14:35 The Great Gig in the Sky
19:22 Money
25:50 Us and Them
33:30 Any Colour You Like
36:55 Brain Damage
40:44 Eclipse
    `;
    const tracks = parseTimestamps(text);
    expect(tracks).toHaveLength(10);
    expect(tracks[0].name).toBe('Speak to Me');
    expect(tracks[9].name).toBe('Eclipse');
  });
});
