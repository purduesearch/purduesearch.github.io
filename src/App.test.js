import { render, screen } from '@testing-library/react';
import App from './App';

// Smoke test for the whole route tree: App mounts, the router resolves "/",
// and the shared chrome renders. This replaces create-react-app's scaffold
// test, which asserted on a "learn react" link this site has never had and so
// could only ever fail once its imports were resolvable.
test('mounts and renders the shared page chrome', () => {
  render(<App />);

  // Navbar. There can be more than one <nav> on a page (SectionProgressRail is
  // also one), so assert presence rather than uniqueness.
  expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0);

  // Footer.
  expect(screen.getByRole('contentinfo')).toBeInTheDocument();
});
