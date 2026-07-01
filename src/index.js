import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { initAosShim } from './anim/aosShim';

const root = ReactDOM.createRoot(document.getElementById('root'));
initAosShim();
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();
