import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { initAosShim } from './anim/aosShim';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// After render, and guarded: the shim is progressive enhancement, so it must
// never be able to prevent the app from mounting.
try {
  initAosShim();
} catch {
  document.documentElement.classList.add('aos-off');
}

reportWebVitals();
