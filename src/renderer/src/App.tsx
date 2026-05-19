import { useState } from 'react'
import type { ReactElement } from 'react'
import Discovery from './components/Discovery/Discovery'
import type { YouTubeAudioMode } from './services/youtube'
import './App.css'

function App(): ReactElement {
  const [audioMode, setAudioMode] = useState<YouTubeAudioMode>('karaoke')

  return (
    <div className="container">
      <Discovery audioMode={audioMode} onAudioModeChange={setAudioMode} />
    </div>
  )
}

export default App
