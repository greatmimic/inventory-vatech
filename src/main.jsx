import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './hooks/useToast.jsx';
import App from './App.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>
);
