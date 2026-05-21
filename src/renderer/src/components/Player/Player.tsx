import React, { useEffect, useState, useRef } from 'react'
import { X, RotateCcw, Play, Pause } from 'lucide-react'
import type { CachedKtvSong, LyricLine, YouTubeAudioMode } from '../../services/youtube'
import AudioModeToggle from '../AudioModeToggle/AudioModeToggle'

const LYRIC_HIGHLIGHT_LEAD_SECONDS = 0.18
const LINE_LOOKAHEAD_SECONDS = 0.28

interface PlayerProps {
  song: {
    name: string
    artist: { name: string }
  }
  videoId: string | null
  cachedSong: CachedKtvSong | null
  videoSearchStatus: 'searching' | 'found' | 'not-found'
  audioMode: YouTubeAudioMode
  onAudioModeChange: (audioMode: YouTubeAudioMode) => void
  onClose: () => void
}

const Player: React.FC<PlayerProps> = ({
  song,
  videoId,
  cachedSong,
  videoSearchStatus,
  audioMode,
  onAudioModeChange,
  onClose
}) => {
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!cachedSong) return undefined

    let animationFrame = 0
    const updateTime = (): void => {
      setCurrentTime(audioRef.current?.currentTime || 0)
      animationFrame = window.requestAnimationFrame(updateTime)
    }

    animationFrame = window.requestAnimationFrame(updateTime)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [cachedSong])

  const activeLine =
    cachedSong?.lyrics.find(
      (line) => currentTime + LINE_LOOKAHEAD_SECONDS >= line.startTime && currentTime < line.endTime
    ) || null

  const nextLine = cachedSong
    ? cachedSong.lyrics.find((line) => line.startTime > currentTime) || null
    : null

  const togglePlay = (): void => {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play()
      } else {
        audioRef.current.pause()
      }
    }
    setIsPlaying(!isPlaying)
  }

  const replay = (): void => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      setIsPlaying(true)
      return
    }

    if (iframeRef.current) {
      // Hard reload iframe to replay
      const currentSrc = iframeRef.current.src
      iframeRef.current.src = ''
      iframeRef.current.src = currentSrc
      setIsPlaying(true)
    }
  }

  const getWordProgress = (startTime: number, endTime: number): number => {
    const adjustedTime = currentTime + LYRIC_HIGHLIGHT_LEAD_SECONDS
    if (adjustedTime <= startTime) return 0
    if (adjustedTime >= endTime) return 1

    const duration = Math.max(endTime - startTime, 0.08)
    return Math.min(Math.max((adjustedTime - startTime) / duration, 0), 1)
  }

  const renderKtvLine = (line: LyricLine | null, isActive: boolean): React.ReactNode => {
    if (!line) return null

    return (
      <div className={`ktv-lyric-line ${isActive ? 'active' : 'upcoming'}`}>
        {line.words.map((word, index) => {
          const progress = isActive ? getWordProgress(word.startTime, word.endTime) : 0
          const style = { '--word-progress': `${progress * 100}%` } as React.CSSProperties

          return (
            <span
              key={`${word.text}-${index}`}
              className={`ktv-word ${progress >= 1 ? 'sung' : ''}`}
              style={style}
            >
              {word.text}
              {/[\u3400-\u9fff]/u.test(word.text) ? '' : ' '}
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div className="player-overlay">
      <div className="player-window">
        <header className="player-header">
          <div className="song-title">
            <span className="name">{song.name}</span>
            <span className="artist">{song.artist.name}</span>
          </div>
          <div className="player-header-actions">
            <AudioModeToggle
              audioMode={audioMode}
              onAudioModeChange={onAudioModeChange}
              className="player-audio-toggle"
            />
            <button className="close-btn" onClick={onClose}>
              <X size={24} />
            </button>
          </div>
        </header>

        <div className="video-container">
          {cachedSong ? (
            <div className="ktv-lyrics-screen">
              <audio
                ref={audioRef}
                src={cachedSong.audioUrl}
                autoPlay
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              <div className="ktv-lyrics-stack">
                {renderKtvLine(activeLine, true)}
                {renderKtvLine(nextLine, false)}
              </div>
            </div>
          ) : videoSearchStatus === 'found' && videoId ? (
            <iframe
              ref={iframeRef}
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="ktv-video"
            ></iframe>
          ) : videoSearchStatus === 'searching' ? (
            <div className="no-video">
              <p>Searching for {audioMode === 'karaoke' ? 'karaoke' : 'original'} version...</p>
            </div>
          ) : (
            <div className="no-video">
              <p>No matching {audioMode === 'karaoke' ? 'karaoke' : 'original'} video found.</p>
              <span>Try the other mode or a more specific song/artist search.</span>
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
