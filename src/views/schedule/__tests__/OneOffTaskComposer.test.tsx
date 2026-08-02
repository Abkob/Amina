// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OneOffTaskComposer } from '../TaskTreeDrawer';

describe('OneOffTaskComposer', () => {
  it('creates a standalone task draft with parsed time and due date', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<OneOffTaskComposer onCreate={onCreate} onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('What needs doing?'), 'Buy printer paper');
    await user.type(screen.getByPlaceholderText('e.g. 30m'), '1h 30m');
    await user.type(screen.getByLabelText('Due date'), '2026-07-30');
    await user.click(screen.getByRole('button', { name: 'Create one-off' }));

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Buy printer paper',
      estimatedMinutes: 90,
      dueDate: '2026-07-30',
    });
  });

  it('allows an undated, unestimated one-off task', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<OneOffTaskComposer onCreate={onCreate} onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('What needs doing?'), 'Call the landlord');
    await user.click(screen.getByRole('button', { name: 'Create one-off' }));

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Call the landlord',
      estimatedMinutes: null,
      dueDate: null,
    });
  });
});
