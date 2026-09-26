import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './heist/HeistApp.tsx';
import './heist/heist.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
