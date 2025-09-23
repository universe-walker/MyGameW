export function normalizeAnswer(input: string | null | undefined): string {
  const text = (input ?? '').toString().toLowerCase();
  return text
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildMaskPayload(answer: string, canReveal: boolean): { len: number; mask: string; canReveal: boolean } {
  const chars = Array.from(answer);
  const isFillable = (ch: string) => /[\p{L}\p{N}]/u.test(ch) && ch !== ' ' && ch !== '-';
  let len = 0;
  const mask = chars
    .map((ch) => {
      if (ch === ' ' || ch === '-') return ch;
      if (isFillable(ch)) {
        len += 1;
        return '*';
      }
      len += 1;
      return '*';
    })
    .join('');

  return { len, mask, canReveal };
}

export function getTestHints(): number {
  const raw = Number(process.env.TEST_HINTS);
  return Number.isInteger(raw) && raw > 0 ? raw : 0;
}

export function isNearMiss(a: string, b: string): boolean {
  if (a === b) return false;
  const la = a.length;
  const lb = b.length;
  const diff = Math.abs(la - lb);
  if (diff > 1) return false;

  if (la === lb) {
    let mismatches = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        mismatches += 1;
        if (mismatches > 1) return false;
      }
    }
    return mismatches === 1;
  }

  const shorter = la < lb ? a : b;
  const longer = la < lb ? b : a;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
    } else {
      edits += 1;
      if (edits > 1) return false;
      j += 1;
    }
  }

  if (j < longer.length || i < shorter.length) edits += 1;
  return edits === 1;
}

export function seededRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
