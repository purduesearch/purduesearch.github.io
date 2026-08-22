import { render, screen } from '@testing-library/react';
import AresTerm from './AresTerm';

describe('AresTerm', () => {
  test('renders its children and exposes the definition', () => {
    render(<AresTerm term="HTBP">HTBP</AresTerm>);
    const el = screen.getByText('HTBP');
    expect(el).toHaveAttribute('data-tip', expect.stringContaining('Human thermal body plume'));
  });

  test('is focusable, so the definition is reachable without a mouse', () => {
    render(<AresTerm term="NDIR">NDIR</AresTerm>);
    expect(screen.getByText('NDIR')).toHaveAttribute('tabindex', '0');
  });

  test('renders children unchanged when the term is unknown', () => {
    render(<AresTerm term="NOT_A_TERM">fallback text</AresTerm>);
    expect(screen.getByText('fallback text')).toBeInTheDocument();
  });
});
