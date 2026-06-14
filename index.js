import { registerRootComponent } from 'expo';
import React from 'react';
import App from './App';
import ErrorBoundary from './src/components/ErrorBoundary';

function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

registerRootComponent(Root);
