
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  document.body.innerHTML = '<div style="color:red; padding:20px; font-weight:bold;">Fatal Error: Root element not found</div>';
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Failed to mount React app:", error);
  rootElement.innerHTML = `
    <div style="padding: 20px; text-align: center; color: #ef4444; font-family: system-ui;">
      <h2 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem;">앱 실행 중 오류가 발생했습니다</h2>
      <p style="font-size: 0.875rem; opacity: 0.8;">${error instanceof Error ? error.message : String(error)}</p>
    </div>
  `;
}
