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
    const { container } = render(<AresTerm term="NOT_A_TERM">fallback text</AresTerm>);
    expect(screen.getByText('fallback text')).toBeInTheDocument();
    expect(container.querySelector('[data-tip]')).not.toBeInTheDocument();
    expect(container.querySelector('.ares-term')).not.toBeInTheDocument();
  });

  test('wires aria-describedby to an element whose text is the definition, for screen readers', () => {
    render(<AresTerm term="HTBP">HTBP</AresTerm>);
    const el = screen.getByText('HTBP');
    const describedById = el.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();
    const description = document.getElementById(describedById);
    expect(description).not.toBeNull();
    expect(description).toHaveTextContent('Human thermal body plume');
  });
});
