import { createRoot } from 'react-dom/client'
import { installCryptoRandomUUIDPolyfill } from './lib/randomId'
import App from './App.tsx'
import './index.css'

installCryptoRandomUUIDPolyfill()

createRoot(document.getElementById('root')!).render(<App />)
