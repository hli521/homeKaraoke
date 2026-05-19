import type { ReactElement } from 'react'
import { MicOff, Volume2 } from 'lucide-react'
import type { YouTubeAudioMode } from '../../services/youtube'

type AudioModeToggleProps = {
  audioMode: YouTubeAudioMode
  onAudioModeChange: (audioMode: YouTubeAudioMode) => void
  className?: string
}

const AudioModeToggle = ({
  audioMode,
  onAudioModeChange,
  className = ''
}: AudioModeToggleProps): ReactElement => (
  <div className={`audio-mode-toggle ${className}`} aria-label="Playback source">
    <button
      type="button"
      className={`audio-mode-btn ${audioMode === 'karaoke' ? 'active' : ''}`}
      onClick={() => onAudioModeChange('karaoke')}
      title="Find karaoke or instrumental versions"
    >
      <MicOff size={18} />
      <span>Karaoke</span>
    </button>
    <button
      type="button"
      className={`audio-mode-btn ${audioMode === 'original' ? 'active' : ''}`}
      onClick={() => onAudioModeChange('original')}
      title="Find original audio, official videos, or lyric videos"
    >
      <Volume2 size={18} />
      <span>Original</span>
    </button>
  </div>
)

export default AudioModeToggle
