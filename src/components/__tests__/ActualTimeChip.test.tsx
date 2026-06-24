// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActualTimeChip } from '../ActualTimeChip';

describe('ActualTimeChip', () => {
  it('renders formatted time in idle state', () => {
    render(<ActualTimeChip minutes={90} onSave={vi.fn()} />);
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
  });

  it('shows delta badge when estimatedMinutes provided and under', () => {
    render(<ActualTimeChip minutes={60} estimatedMinutes={90} onSave={vi.fn()} />);
    // Under by 30m → "-30m" badge
    expect(screen.getByText('-30m')).toBeInTheDocument();
  });

  it('shows over-budget delta when actual > estimated', () => {
    render(<ActualTimeChip minutes={120} estimatedMinutes={60} onSave={vi.fn()} />);
    expect(screen.getByText('+1h')).toBeInTheDocument();
  });

  it('click switches to input with pre-filled value', async () => {
    const user = userEvent.setup();
    render(<ActualTimeChip minutes={60} onSave={vi.fn()} />);
    await user.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/e\.g\./i);
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('1h');
  });

  it('Enter calls onSave with parsed minutes', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<ActualTimeChip minutes={60} onSave={onSave} />);
    await user.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/e\.g\./i);
    await user.clear(input);
    await user.type(input, '2h');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith(120);
  });

  it('Escape closes input without calling onSave', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<ActualTimeChip minutes={60} onSave={onSave} />);
    await user.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/e\.g\./i);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    // Input should be gone, button back
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('blur commits the value', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<ActualTimeChip minutes={30} onSave={onSave} />);
    await user.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/e\.g\./i);
    await user.clear(input);
    await user.type(input, '45m');
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith(45);
  });

  it('empty submit calls onSave(null) to clear the value', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<ActualTimeChip minutes={60} onSave={onSave} />);
    await user.click(screen.getByRole('button'));
    const input = screen.getByPlaceholderText(/e\.g\./i);
    await user.clear(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith(null);
  });
});
