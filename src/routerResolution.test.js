import * as reactRouterDom from 'react-router-dom';

// Regression guard for the package.json jest.moduleNameMapper entries that
// point react-router-dom (and its react-router/dom subpath) at concrete CJS
// files.
//
// react-router-dom 7.14.0 declares `main: "./dist/main.js"`, a file it does not
// ship; the real entry is only reachable through its `exports` map. Webpack and
// Node read `exports` so the app builds and runs, but Jest 27 (pinned by
// react-scripts 5) predates `exports` support, falls back to the dangling
// `main`, and fails with "Cannot find module 'react-router-dom'".
//
// 43 source files import react-router-dom, so without those mappings none of
// them can be unit tested at all. If this suite fails to load, the mappings
// were dropped or a dependency bump moved the dist files.
test('react-router-dom resolves to its real entry point under jest', () => {
  expect(typeof reactRouterDom.BrowserRouter).toBe('function');
  expect(typeof reactRouterDom.MemoryRouter).toBe('function');
  expect(typeof reactRouterDom.Routes).toBe('function');
  expect(typeof reactRouterDom.Route).toBe('function');
  expect(typeof reactRouterDom.useLocation).toBe('function');
});

test('the react-router/dom subpath export resolves', () => {
  // react-router-dom's entry requires this subpath, which is likewise only
  // declared in an exports map.
  expect(() => require('react-router/dom')).not.toThrow();
});
