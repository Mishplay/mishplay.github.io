import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initUpdates } from './app/update'
import './styles/index.css'
import App from './app/App'

initUpdates()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
