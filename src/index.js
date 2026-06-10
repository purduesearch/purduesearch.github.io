import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Dismiss orbit loader after React's first paint
requestAnimationFrame(() => requestAnimationFrame(() => {
  const loader = document.getElementById('orbit-loader');
  if (loader) {
    loader.classList.add('fade-out');
    setTimeout(() => loader.remove(), 650);
  }
}));

reportWebVitals();
