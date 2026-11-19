import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

const rootEl = document.getElementById('appRoot');
const code = rootEl.getAttribute('data-code');

ReactDOM.render(
  <App code={code} />,
  rootEl
);
