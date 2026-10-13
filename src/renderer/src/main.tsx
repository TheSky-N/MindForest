import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/index.css'

document.documentElement.dataset.theme = 'forest'
document.documentElement.dataset.mode = 'dark'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
