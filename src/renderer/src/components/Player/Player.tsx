import React, { useState, useRef } from 'react'
import { X, RotateCcw, Play, Pause } from 'lucide-react'

interface PlayerProps {
  song: {
    name: string
    artist: { name: string }
  }
  videoId: string | null
  onClose: () => void
}

const Player: React.FC<PlayerProps> = ({ song, videoId, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const togglePlay = (): void => {
    // YouTube IFrame API control is complex without the full API script
    // For now, we'll just toggle the UI state as the user can use the YouTube controls
    setIsPlaying(!isPlaying)
  }

  const replay = (): void => {
    if (iframeRef.current) {
      // Hard reload iframe to replay
      const currentSrc = iframeRef.current.src
      iframeRef.current.src = ''
      iframeRef.current.src = currentSrc
      setIsPlaying(true)
    }
  }

  return (
    <div className="player-overlay">
      <div className="player-window">
        <header className="player-header">
          <div className="song-title">
            <span className="name">{song.name}</span>
            <span className="artist">{song.artist.name}</span>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </header>

        <div className="video-container">
          {videoId ? (
            <iframe
              ref={iframeRef}
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="ktv-video"
            ></iframe>
          ) : (
            <div className="no-video">
              <p>Searching for Karaoke version...</p>
            </div>
          )}
        </div>

        <footer className="player-controls">
          <button className="control-btn" onClick={togglePlay}>
            {isPlaying ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button className="control-btn" onClick={replay} title="Replay">
            <RotateCcw size={28} />
          </button>
        </footer>
      </div>
    </div>
  )
}

export default Player
