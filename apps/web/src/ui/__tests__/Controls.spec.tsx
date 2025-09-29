import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Controls } from '../Controls';
import { useGameStore } from '../../state/store';

function renderControls(overrides: Partial<React.ComponentProps<typeof Controls>> = {}) {
  const props: React.ComponentProps<typeof Controls> = {
    onAnswer: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onLeave: vi.fn(),
    isMyTurnToAnswer: true,
    solo: true,
    paused: false,
    ...overrides,
  };
  return render(<Controls {...props} />);
}

describe('Controls masked input', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useGameStore.setState({
      answerMask: null,
      answerLen: 0,
      nearMissAt: null,
    } as any);
  });

  it('renders mask with stars and visible separators', async () => {
    useGameStore.setState({ answerMask: '*** **-**' } as any);
    renderControls();
    const display = await screen.findByTestId('mask-display');
    expect(display).toBeInTheDocument();
    expect(display.textContent).toBe('*** **-**');
  });

  it('focuses input when clicking on the mask', async () => {
    useGameStore.setState({ answerMask: '*****' } as any);
    renderControls();
    const display = screen.getByTestId('mask-display');
    await userEvent.click(display);
    const input = document.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    // JSDOM doesn't manage focus styles, but activeElement should be the input
    expect(document.activeElement === input).toBe(true);
  });

  it('fills stars left-to-right as user types and supports backspace', async () => {
    useGameStore.setState({ answerMask: '*****' } as any);
    renderControls();
    const display = screen.getByTestId('mask-display');
    await userEvent.click(display);
    await userEvent.type(display, 'hel');
    expect(display.textContent).toBe('hel**');
    await userEvent.keyboard('{Backspace}');
    expect(display.textContent).toBe('he***');
  });

  it('submits composed answer with separators preserved on Enter', async () => {
    useGameStore.setState({ answerMask: '***-**' } as any);
    const onAnswer = vi.fn();
    renderControls({ onAnswer });
    const display = screen.getByTestId('mask-display');
    await userEvent.click(display);
    await userEvent.type(display, 'hello');
    // Now press Enter
    await userEvent.keyboard('{Enter}');
    expect(onAnswer).toHaveBeenCalledWith('hel-lo');
  });

  it('prevents typing when mask has no hidden placeholders', async () => {
    useGameStore.setState({ answerMask: 'done', answerLen: 4 } as any);
    renderControls();
    const display = screen.getByTestId('mask-display');
    await userEvent.click(display);
    const input = document.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(input?.maxLength).toBe(0);
    await userEvent.type(display, 'abc');
    expect(display.textContent).toBe('done');
  });
  it('shows near-miss message when nearMissAt is set and input is empty', async () => {
    useGameStore.setState({ answerMask: '***', nearMissAt: Date.now() } as any);
    renderControls();
    expect(screen.getByText(/ошибка/i)).toBeInTheDocument();
  });
});
