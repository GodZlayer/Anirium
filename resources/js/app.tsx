import React from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import { ThemeProvider } from './context/ThemeContext';
import '../css/app.css';

createInertiaApp({
  title: (title) => `${title} - Anirium`,
  resolve: (name) => {
    const pages = import.meta.glob('./Pages/**/*.tsx', { eager: true });
    return pages[`./Pages/${name}.tsx`];
  },
  setup({ el, App, props }) {
    createRoot(el).render(
      <ThemeProvider>
        <App {...props} />
      </ThemeProvider>
    );
  },
});
