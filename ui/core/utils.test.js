import { describe, it, expect } from 'vitest';
import { formatTime, guessArtistFromTitle, decodeEntities, parseYouTubeUrl } from './utils.js';

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

describe('decodeEntities', () => {
  it('decodes &quot; to double quote', () => {
    expect(decodeEntities('&quot;Broken Cog&quot;')).toBe('"Broken Cog"');
  });

  it('decodes &amp;, &lt;, &gt;, &apos;', () => {
    expect(decodeEntities('Salt &amp; Pepper')).toBe('Salt & Pepper');
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeEntities('it&apos;s')).toBe("it's");
  });

  it('decodes numeric entities (decimal and hex)', () => {
    expect(decodeEntities('it&#39;s')).toBe("it's");
    expect(decodeEntities('&#91;ref&#93;')).toBe('[ref]');
    expect(decodeEntities('&#x27;hi&#x27;')).toBe("'hi'");
  });

  it('handles mixed entities in a single string', () => {
    expect(decodeEntities('Rock &amp; Roll &quot;Live&quot; &#39;75'))
      .toBe('Rock & Roll "Live" \'75');
  });

  it('leaves unknown entities untouched', () => {
    expect(decodeEntities('&unknown;')).toBe('&unknown;');
  });

  it('handles non-string input safely', () => {
    expect(decodeEntities(null)).toBe(null);
    expect(decodeEntities(undefined)).toBe(undefined);
    expect(decodeEntities(42)).toBe(42);
  });

  it('returns plain text unchanged', () => {
    expect(decodeEntities('Pink Floyd - Dark Side')).toBe('Pink Floyd - Dark Side');
  });
});

describe('parseYouTubeUrl', () => {
  it('parses standard watch URL with video id', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=fwEaJBKrLvA'))
      .toEqual({ kind: 'video', id: 'fwEaJBKrLvA' });
  });

  it('parses youtu.be short URL', () => {
    expect(parseYouTubeUrl('https://youtu.be/fwEaJBKrLvA'))
      .toEqual({ kind: 'video', id: 'fwEaJBKrLvA' });
  });

  it('parses watch URL with both video id and playlist (prefers playlist)', () => {
    const r = parseYouTubeUrl('https://www.youtube.com/watch?v=xvAmj3k3Imc&list=PLML7ziSV-WtOSMN1GeSC-otS7FrCLxs0V');
    expect(r).toEqual({
      kind: 'playlist',
      id: 'PLML7ziSV-WtOSMN1GeSC-otS7FrCLxs0V',
      videoId: 'xvAmj3k3Imc',
    });
  });

  it('parses /playlist URL with list param only', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=PLML7ziSV-WtOSMN1GeSC-otS7FrCLxs0V'))
      .toEqual({ kind: 'playlist', id: 'PLML7ziSV-WtOSMN1GeSC-otS7FrCLxs0V' });
  });

  it('accepts m.youtube.com hostname', () => {
    expect(parseYouTubeUrl('https://m.youtube.com/watch?v=fwEaJBKrLvA'))
      .toEqual({ kind: 'video', id: 'fwEaJBKrLvA' });
  });

  it('accepts a bare 11-char video id', () => {
    expect(parseYouTubeUrl('fwEaJBKrLvA'))
      .toEqual({ kind: 'video', id: 'fwEaJBKrLvA' });
  });

  it('accepts a bare PL-prefixed playlist id', () => {
    expect(parseYouTubeUrl('PLML7ziSV-WtOSMN1GeSC-otS7FrCLxs0V'))
      .toEqual({ kind: 'playlist', id: 'PLML7ziSV-WtOSMN1GeSC-otS7FrCLxs0V' });
  });

  it('rejects non-YouTube URLs', () => {
    expect(parseYouTubeUrl('https://vimeo.com/12345')).toBe(null);
    expect(parseYouTubeUrl('https://example.com/watch?v=fwEaJBKrLvA')).toBe(null);
  });

  it('rejects empty / non-string / garbage input', () => {
    expect(parseYouTubeUrl('')).toBe(null);
    expect(parseYouTubeUrl(null)).toBe(null);
    expect(parseYouTubeUrl(undefined)).toBe(null);
    expect(parseYouTubeUrl(42)).toBe(null);
    expect(parseYouTubeUrl('Pink Floyd Dark Side')).toBe(null);
  });

  it('trims surrounding whitespace', () => {
    expect(parseYouTubeUrl('  https://youtu.be/fwEaJBKrLvA  '))
      .toEqual({ kind: 'video', id: 'fwEaJBKrLvA' });
  });
});
