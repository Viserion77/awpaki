import { FILE_EXTENSIONS, MIME_TYPE_TO_EXTENSION, getExtensionFromMimeType } from './index';

describe('FILE_EXTENSIONS', () => {
  it('exposes every extension required by the mapping', () => {
    expect(FILE_EXTENSIONS.JPG).toBe('jpg');
    expect(FILE_EXTENSIONS.PNG).toBe('png');
    expect(FILE_EXTENSIONS.GIF).toBe('gif');
    expect(FILE_EXTENSIONS.WEBP).toBe('webp');
    expect(FILE_EXTENSIONS.SVG).toBe('svg');
    expect(FILE_EXTENSIONS.BMP).toBe('bmp');
    expect(FILE_EXTENSIONS.TIFF).toBe('tiff');
    expect(FILE_EXTENSIONS.ICO).toBe('ico');
    expect(FILE_EXTENSIONS.PDF).toBe('pdf');
    expect(FILE_EXTENSIONS.DOC).toBe('doc');
    expect(FILE_EXTENSIONS.DOCX).toBe('docx');
    expect(FILE_EXTENSIONS.XLS).toBe('xls');
    expect(FILE_EXTENSIONS.XLSX).toBe('xlsx');
    expect(FILE_EXTENSIONS.PPT).toBe('ppt');
    expect(FILE_EXTENSIONS.PPTX).toBe('pptx');
    expect(FILE_EXTENSIONS.TXT).toBe('txt');
    expect(FILE_EXTENSIONS.CSV).toBe('csv');
    expect(FILE_EXTENSIONS.RTF).toBe('rtf');
    expect(FILE_EXTENSIONS.ZIP).toBe('zip');
    expect(FILE_EXTENSIONS.GZ).toBe('gz');
    expect(FILE_EXTENSIONS.TAR).toBe('tar');
    expect(FILE_EXTENSIONS.RAR).toBe('rar');
    expect(FILE_EXTENSIONS.SEVEN_ZIP).toBe('7z');
    expect(FILE_EXTENSIONS.MP3).toBe('mp3');
    expect(FILE_EXTENSIONS.WAV).toBe('wav');
    expect(FILE_EXTENSIONS.MP4).toBe('mp4');
    expect(FILE_EXTENSIONS.MPEG).toBe('mpeg');
    expect(FILE_EXTENSIONS.WEBM).toBe('webm');
    expect(FILE_EXTENSIONS.JSON).toBe('json');
    expect(FILE_EXTENSIONS.XML).toBe('xml');
    expect(FILE_EXTENSIONS.HTML).toBe('html');
  });

  it('has no duplicated extension values', () => {
    const values = Object.values(FILE_EXTENSIONS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('MIME_TYPE_TO_EXTENSION', () => {
  it('has at least 27 entries', () => {
    expect(Object.keys(MIME_TYPE_TO_EXTENSION).length).toBeGreaterThanOrEqual(27);
  });

  it('only maps to values declared in FILE_EXTENSIONS', () => {
    const allowed = new Set<string>(Object.values(FILE_EXTENSIONS));
    for (const value of Object.values(MIME_TYPE_TO_EXTENSION)) {
      expect(allowed.has(value)).toBe(true);
    }
  });

  it('uses already normalized keys (lowercase, no parameters, no whitespace)', () => {
    for (const key of Object.keys(MIME_TYPE_TO_EXTENSION)) {
      expect(key).toBe(key.toLowerCase().trim());
      expect(key).not.toContain(';');
      expect(key).toContain('/');
    }
  });

  it('covers every extension declared in FILE_EXTENSIONS', () => {
    const mapped = new Set<string>(Object.values(MIME_TYPE_TO_EXTENSION));
    for (const extension of Object.values(FILE_EXTENSIONS)) {
      expect(mapped.has(extension)).toBe(true);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(MIME_TYPE_TO_EXTENSION)).toBe(true);
  });
});

describe('getExtensionFromMimeType', () => {
  describe('hits', () => {
    const cases: Array<[string, FILE_EXTENSIONS]> = [
      // Images
      ['image/jpeg', FILE_EXTENSIONS.JPG],
      ['image/png', FILE_EXTENSIONS.PNG],
      ['image/gif', FILE_EXTENSIONS.GIF],
      ['image/webp', FILE_EXTENSIONS.WEBP],
      ['image/svg+xml', FILE_EXTENSIONS.SVG],
      ['image/bmp', FILE_EXTENSIONS.BMP],
      ['image/tiff', FILE_EXTENSIONS.TIFF],
      ['image/x-icon', FILE_EXTENSIONS.ICO],
      // Documents
      ['application/pdf', FILE_EXTENSIONS.PDF],
      ['application/msword', FILE_EXTENSIONS.DOC],
      [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        FILE_EXTENSIONS.DOCX,
      ],
      ['application/vnd.ms-excel', FILE_EXTENSIONS.XLS],
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', FILE_EXTENSIONS.XLSX],
      ['application/vnd.ms-powerpoint', FILE_EXTENSIONS.PPT],
      [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        FILE_EXTENSIONS.PPTX,
      ],
      ['text/plain', FILE_EXTENSIONS.TXT],
      ['text/csv', FILE_EXTENSIONS.CSV],
      ['application/rtf', FILE_EXTENSIONS.RTF],
      // Archives
      ['application/zip', FILE_EXTENSIONS.ZIP],
      ['application/gzip', FILE_EXTENSIONS.GZ],
      ['application/x-tar', FILE_EXTENSIONS.TAR],
      ['application/vnd.rar', FILE_EXTENSIONS.RAR],
      ['application/x-7z-compressed', FILE_EXTENSIONS.SEVEN_ZIP],
      // Audio / video
      ['audio/mpeg', FILE_EXTENSIONS.MP3],
      ['audio/wav', FILE_EXTENSIONS.WAV],
      ['video/mp4', FILE_EXTENSIONS.MP4],
      ['video/mpeg', FILE_EXTENSIONS.MPEG],
      ['video/webm', FILE_EXTENSIONS.WEBM],
      // Data / markup
      ['application/json', FILE_EXTENSIONS.JSON],
      ['application/xml', FILE_EXTENSIONS.XML],
      ['text/html', FILE_EXTENSIONS.HTML],
    ];

    it.each(cases)('resolves %s to %s', (mimeType, expected) => {
      expect(getExtensionFromMimeType(mimeType)).toBe(expected);
    });

    it('resolves every key declared in the map', () => {
      for (const [mimeType, expected] of Object.entries(MIME_TYPE_TO_EXTENSION)) {
        expect(getExtensionFromMimeType(mimeType)).toBe(expected);
      }
    });

    it.each([
      ['image/jpg', FILE_EXTENSIONS.JPG],
      ['image/vnd.microsoft.icon', FILE_EXTENSIONS.ICO],
      ['text/rtf', FILE_EXTENSIONS.RTF],
      ['application/x-zip-compressed', FILE_EXTENSIONS.ZIP],
      ['application/x-gzip', FILE_EXTENSIONS.GZ],
      ['application/x-rar-compressed', FILE_EXTENSIONS.RAR],
      ['audio/mp3', FILE_EXTENSIONS.MP3],
      ['audio/x-wav', FILE_EXTENSIONS.WAV],
      ['audio/webm', FILE_EXTENSIONS.WEBM],
      ['text/xml', FILE_EXTENSIONS.XML],
    ])('resolves the legacy alias %s to %s', (mimeType, expected) => {
      expect(getExtensionFromMimeType(mimeType)).toBe(expected);
    });

    it('never returns an extension starting with a dot', () => {
      for (const mimeType of Object.keys(MIME_TYPE_TO_EXTENSION)) {
        expect(getExtensionFromMimeType(mimeType)).not.toMatch(/^\./);
      }
    });
  });

  describe('misses', () => {
    it.each([
      'application/x-unknown',
      'foo/bar',
      'application/octet-stream',
      'image/heic',
      'png',
      'image',
      'image/',
      '/png',
      'application/json/extra',
    ])('returns undefined for the unknown type %s', (mimeType) => {
      expect(getExtensionFromMimeType(mimeType)).toBeUndefined();
    });

    it('does not do partial or prefix matching', () => {
      expect(getExtensionFromMimeType('application/jsonx')).toBeUndefined();
      expect(getExtensionFromMimeType('xapplication/json')).toBeUndefined();
    });
  });

  describe('parameter handling', () => {
    it.each([
      ['text/plain; charset=utf-8', FILE_EXTENSIONS.TXT],
      ['text/plain;charset=utf-8', FILE_EXTENSIONS.TXT],
      ['text/plain ; charset=utf-8', FILE_EXTENSIONS.TXT],
      ['application/json; charset=UTF-8', FILE_EXTENSIONS.JSON],
      ['text/csv; charset=utf-8; header=present', FILE_EXTENSIONS.CSV],
      ['image/svg+xml; charset=utf-8', FILE_EXTENSIONS.SVG],
      ['text/plain;', FILE_EXTENSIONS.TXT],
    ])('ignores the parameters of %s', (mimeType, expected) => {
      expect(getExtensionFromMimeType(mimeType)).toBe(expected);
    });

    it('returns undefined when the type part is empty', () => {
      expect(getExtensionFromMimeType('; charset=utf-8')).toBeUndefined();
      expect(getExtensionFromMimeType(';')).toBeUndefined();
    });
  });

  describe('casing and whitespace', () => {
    it.each([
      ['IMAGE/PNG', FILE_EXTENSIONS.PNG],
      ['Image/Png', FILE_EXTENSIONS.PNG],
      ['Application/PDF', FILE_EXTENSIONS.PDF],
      ['APPLICATION/VND.MS-EXCEL', FILE_EXTENSIONS.XLS],
      ['  image/png  ', FILE_EXTENSIONS.PNG],
      ['\timage/png\n', FILE_EXTENSIONS.PNG],
      ['  TEXT/Plain; charset=UTF-8  ', FILE_EXTENSIONS.TXT],
    ])('normalizes %s to %s', (mimeType, expected) => {
      expect(getExtensionFromMimeType(mimeType)).toBe(expected);
    });
  });

  describe('invalid input', () => {
    it.each(['', ' ', '   ', '\t', '\n', '\t \n'])(
      'returns undefined for the blank input %j',
      (mimeType) => {
        expect(getExtensionFromMimeType(mimeType)).toBeUndefined();
      }
    );

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a number', 123],
      ['an object', {}],
      ['an array', []],
      ['a boolean', true],
      ['a function', () => 'image/png'],
    ])('returns undefined for %s', (_label, value) => {
      expect(getExtensionFromMimeType(value as unknown as string)).toBeUndefined();
    });

    it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
      'does not leak the inherited property %s',
      (mimeType) => {
        expect(getExtensionFromMimeType(mimeType)).toBeUndefined();
      }
    );
  });

  describe('purity', () => {
    it('does not mutate the lookup table', () => {
      const before = { ...MIME_TYPE_TO_EXTENSION };
      getExtensionFromMimeType('image/png');
      getExtensionFromMimeType('unknown/type');
      expect({ ...MIME_TYPE_TO_EXTENSION }).toEqual(before);
    });

    it('returns the same result for repeated calls', () => {
      expect(getExtensionFromMimeType('image/png')).toBe(getExtensionFromMimeType('IMAGE/PNG'));
    });
  });
});
