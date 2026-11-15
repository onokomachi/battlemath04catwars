import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { CatWars } from './catwars/components/CatWars';
import { ErrorBoundary } from './catwars/components/ui/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element to mount to');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <CatWars />
    </ErrorBoundary>
  </React.StrictMode>,
);
