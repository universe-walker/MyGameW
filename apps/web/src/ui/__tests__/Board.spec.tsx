import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Board } from '../Board';

type Cat = { title: string; values: number[] };

const ROOM_ID = '00000000-0000-0000-0000-000000000000';

function makeBoard(valuesPerCat: number[][], titles: string[] = ['Cat A', 'Cat B', 'Cat C']): Cat[] {
  return titles.map((t, i) => ({ title: t, values: valuesPerCat[i] ?? [] }));
}

describe('Board cost rows persist as disabled when used', () => {
  it('keeps the 200 row visible and disables its cells after all 200s are used', async () => {
    const titles = ['Cat A', 'Cat B'];
    const initial = makeBoard(
      [
        [100, 200, 300],
        [100, 200, 300],
      ],
      titles,
    );

    const { rerender } = render(<Board roomId={ROOM_ID} board={initial} canPick={true} />);

    // Initially, there should be one "200" cell per category and they should be enabled
    let cells200 = screen.getAllByRole('button', { name: '200' });
    expect(cells200.length).toBe(titles.length);
    for (const btn of cells200) {
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    }

    // Update the board so that value 200 is no longer available in any category
    const updated = makeBoard(
      [
        [100, 300],
        [100, 300],
      ],
      titles,
    );

    rerender(<Board roomId={ROOM_ID} board={updated} canPick={true} />);

    // The "200" row should still be present (same count), but all its cells are disabled now
    cells200 = screen.getAllByRole('button', { name: '200' });
    expect(cells200.length).toBe(titles.length);
    for (const btn of cells200) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('keeps categories (columns) visible even if a category becomes empty', async () => {
    const titles = ['Cat A', 'Cat B'];
    const initial = makeBoard(
      [
        [100, 200],
        [100, 200],
      ],
      titles,
    );

    const { rerender } = render(<Board roomId={ROOM_ID} board={initial} canPick={true} />);

    // Both headers rendered
    for (const t of titles) {
      expect(screen.getByText(t)).toBeTruthy();
    }

    // Remove Cat B entirely from the board state
    const updated = makeBoard([[100], /* Cat B missing */ []], ['Cat A']);
    rerender(<Board roomId={ROOM_ID} board={updated as any} canPick={true} />);

    // Headers should still include Cat B (from initial snapshot)
    expect(screen.getByText('Cat A')).toBeTruthy();
    expect(screen.getByText('Cat B')).toBeTruthy();

    // Row for 100 should still have two cells (one per original category)
    const cells100 = screen.getAllByRole('button', { name: '100' });
    expect(cells100.length).toBe(2);
    // At least one of them should be disabled (the missing category column)
    const hasDisabled = cells100.some((b) => (b as HTMLButtonElement).disabled);
    expect(hasDisabled).toBe(true);
  });

  it('keeps the 100 row after unmount/remount within same room', async () => {
    const titles = ['A', 'B'];
    const room = '11111111-1111-1111-1111-111111111111';
    const first = makeBoard(
      [
        [100, 200],
        [100, 200],
      ],
      titles,
    );
    const { unmount } = render(<Board roomId={room} board={first} canPick={true} />);
    // 100 present and enabled
    let cells100 = screen.getAllByRole('button', { name: '100' });
    expect(cells100.length).toBe(2);
    unmount();

    // Re-mount board for the same room without 100
    const second = makeBoard(
      [
        [200],
        [200],
      ],
      titles,
    );
    render(<Board roomId={room} board={second} canPick={true} />);
    cells100 = screen.getAllByRole('button', { name: '100' });
    expect(cells100.length).toBe(2);
    // All should be disabled since 100 is no longer available
    for (const btn of cells100) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
