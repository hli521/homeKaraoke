import { ipcMain, app, BrowserWindow } from 'electron'
import youtubedl from 'youtube-dl-exec'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import axios from 'axios'
import ytSearch from 'yt-search'
import db from './db'

const downloadFolder = join(app.getPath('downloads'), 'KaraokeApp')
const ITUNES_BASE_URL = 'https://itunes.apple.com'
const APPLE_RSS_BASE_URL = 'https://rss.applemarketingtools.com/api/v2'

type YouTubeAudioMode = 'original' | 'karaoke'

type YouTubeSearchRequest = {
  artist: string
  song: string
  audioMode: YouTubeAudioMode
}

type YouTubeVideoResult = {
  videoId?: string
  title?: string
  views?: number
  author?: {
    name?: string
  }
}

type YouTubeSearchResult = {
  videos?: YouTubeVideoResult[]
}

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const getSearchTerms = (value: string): string[] => {
  const normalized = normalizeSearchText(value)
  if (!normalized) return []
  return normalized.split(' ').filter((term) => term.length > 1)
}

const textMatchesValue = (text: string, value: string): boolean => {
  const normalizedText = normalizeSearchText(text)
  const normalizedValue = normalizeSearchText(value)
  const terms = getSearchTerms(value)

  if (!normalizedText || !normalizedValue) return false
  if (normalizedText.includes(normalizedValue)) return true
  if (terms.length === 0) return false

  const requiredMatches = Math.max(1, Math.ceil(terms.length * 0.65))
  return terms.filter((term) => normalizedText.includes(term)).length >= requiredMatches
}

const hasSearchSignal = (text: string, signal: string): boolean => {
  const normalizedSignal = normalizeSearchText(signal)
  if (!normalizedSignal) return false
  if ([...normalizedSignal].some((char) => char.charCodeAt(0) > 127)) {
    return text.includes(normalizedSignal)
  }
  return ` ${text} `.includes(` ${normalizedSignal} `)
}

const hasAnySignal = (text: string, signals: string[]): boolean =>
  signals.some((signal) => hasSearchSignal(text, signal))

const unsuitableForKaraokeSignals = [
  'live',
  'stage',
  'performance',
  'concert',
  'festival',
  'cover',
  'reaction',
  'interview',
  'tv',
  'show',
  'episode',
  'ep',
  'pure version',
  'sing china',
  'voice of china',
  '中国新歌声',
  '中国好声音',
  '浙江卫视',
  '纯享版',
  '现场',
  '演唱会',
  '舞台',
  '综艺',
  '节目',
  '翻唱',
  '反应',
  'reaction'
]

const karaokeSignals = [
  'karaoke',
  'instrumental',
  '伴奏',
  'ktv',
  'off vocal',
  'minus one',
  'sing along',
  'with lyrics',
  '带歌词',
  '字幕'
]

const originalSignals = [
  'official mv',
  'official music video',
  'official audio',
  'official lyric',
  'lyric video',
  'lyrics',
  'music video',
  'audio',
  'mv',
  '完整版',
  '官方mv',
  '官方 mv',
  '官方音乐视频',
  '官方音频',
  '官方歌词',
  '歌词版',
  '歌詞版',
  'lyrics'
]

const isUnsuitableForKaraoke = (video: YouTubeVideoResult): boolean => {
  const title = normalizeSearchText(video.title || '')
  const author = normalizeSearchText(video.author?.name || '')
  const searchableText = `${title} ${author}`

  return hasAnySignal(searchableText, unsuitableForKaraokeSignals)
}

const hasModeSignal = (video: YouTubeVideoResult, audioMode: YouTubeAudioMode): boolean => {
  const title = normalizeSearchText(video.title || '')
  if (audioMode === 'original') {
    return (
      !isUnsuitableForKaraoke(video) &&
      !hasAnySignal(title, karaokeSignals) &&
      hasAnySignal(title, originalSignals)
    )
  }

  return !isUnsuitableForKaraoke(video) && hasAnySignal(title, karaokeSignals)
}

const getModeScore = (video: YouTubeVideoResult, audioMode: YouTubeAudioMode): number => {
  const title = normalizeSearchText(video.title || '')

  if (isUnsuitableForKaraoke(video)) return -100
  if (audioMode === 'karaoke') {
    if (hasAnySignal(title, ['karaoke', 'ktv'])) return 90
    if (hasAnySignal(title, ['伴奏', 'off vocal'])) return 80
    if (hasAnySignal(title, ['instrumental', 'minus one'])) return 70
    if (hasAnySignal(title, ['lyrics', '歌词', '歌詞'])) return 40
    return 0
  }

  if (hasAnySignal(title, ['official mv', 'official music video'])) return 90
  if (hasAnySignal(title, ['官方mv', '官方 mv', '官方音乐视频'])) return 90
  if (hasAnySignal(title, ['official lyric', 'lyric video'])) return 80
  if (hasAnySignal(title, ['lyrics', '歌词', '歌詞'])) return 70
  if (hasAnySignal(title, ['official audio', '官方音频'])) return 65
  if (hasAnySignal(title, ['music video', 'mv'])) return 55
  return 0
}

const buildYouTubeQueries = ({ artist, song, audioMode }: YouTubeSearchRequest): string[] => {
  if (audioMode === 'original') {
    return [
      `${artist} ${song} official mv`,
      `${artist} ${song} official lyrics`,
      `${artist} ${song} lyric video`,
      `${artist} ${song} official audio lyrics`,
      `${artist} ${song} 官方 MV 歌词`
    ]
  }

  return [
    `${artist} ${song} karaoke lyrics`,
    `${artist} ${song} ktv karaoke`,
    `${artist} ${song} instrumental karaoke lyrics`,
    `${artist} ${song} off vocal lyrics`,
    `${artist} ${song} 伴奏 带歌词`,
    `${artist} ${song} KTV 伴奏`
  ]
}

const findBestYouTubeVideo = (
  videos: YouTubeVideoResult[],
  request: YouTubeSearchRequest
): string | null => {
  const matchingVideos = videos.filter((video) => {
    const title = video.title || ''
    const author = video.author?.name || ''
    const artistMatches = textMatchesValue(`${title} ${author}`, request.artist)
    const songMatches = textMatchesValue(title, request.song)
    return Boolean(video.videoId && artistMatches && songMatches)
  })

  const suitableVideos = matchingVideos.filter((video) => !isUnsuitableForKaraoke(video))
  const modeMatches = suitableVideos.filter((video) => hasModeSignal(video, request.audioMode))
  const candidates = modeMatches.length > 0 ? modeMatches : suitableVideos

  return (
    candidates.sort((a, b) => {
      const scoreDelta = getModeScore(b, request.audioMode) - getModeScore(a, request.audioMode)
      if (scoreDelta !== 0) return scoreDelta
      return (b.views || 0) - (a.views || 0)
    })[0]?.videoId || null
  )
}

const getBestYouTubeVideoId = async (request: YouTubeSearchRequest): Promise<string | null> => {
  const searches = await Promise.all(
    buildYouTubeQueries(request).map((query) => ytSearch(query) as Promise<YouTubeSearchResult>)
  )
  const seenVideoIds = new Set<string>()
  const videos = searches
    .flatMap((result) => result.videos || [])
    .filter((video) => {
      if (!video.videoId || seenVideoIds.has(video.videoId)) return false
      seenVideoIds.add(video.videoId)
      return true
    })

  return findBestYouTubeVideo(videos, request)
}

if (!existsSync(downloadFolder)) {
  mkdirSync(downloadFolder, { recursive: true })
}

export const setupIpcHandlers = (mainWindow: BrowserWindow): void => {
  // Metadata Handlers (Bypass CORS)
  ipcMain.handle('fetch-top-tracks', async (_event, countryCode) => {
    try {
      const url = `${APPLE_RSS_BASE_URL}/${countryCode.toLowerCase()}/music/most-played/50/songs.json`
      const response = await axios.get(url)
      return response.data.feed.results
    } catch (error) {
      console.error('fetch-top-tracks failed', error)
      return []
    }
  })

  ipcMain.handle('search-artists', async (_event, term, country = 'us') => {
    try {
      const response = await axios.get(`${ITUNES_BASE_URL}/search`, {
        params: { term, entity: 'musicArtist', country, limit: 25 }
      })
      return response.data.results
    } catch (error) {
      console.error('search-artists failed', error)
      return []
    }
  })

  ipcMain.handle('fetch-artist-top-tracks', async (_event, artistId, country = 'us') => {
    try {
      const response = await axios.get(`${ITUNES_BASE_URL}/lookup`, {
        params: { id: artistId, entity: 'song', limit: 100, country }
      })
      return response.data.results
    } catch (error) {
      console.error('fetch-artist-top-tracks failed', error)
      return []
    }
  })

  ipcMain.handle('search-tracks', async (_event, term, country = 'us') => {
    try {
      const response = await axios.get(`${ITUNES_BASE_URL}/search`, {
        params: { term, entity: 'song', country, limit: 100 }
      })
      return response.data.results
    } catch (error) {
      console.error('search-tracks failed', error)
      return []
    }
  })

  ipcMain.handle('youtube-search', async (_event, request: YouTubeSearchRequest) => {
    try {
      return getBestYouTubeVideoId(request)
    } catch (error) {
      console.error('youtube-search failed', error)
      return null
    }
  })

  ipcMain.handle('youtube-has-source', async (_event, request: YouTubeSearchRequest) => {
    try {
      return Boolean(await getBestYouTubeVideoId(request))
    } catch (error) {
      console.error('youtube-has-source failed', error)
      return false
    }
  })

  // Download Handlers
  ipcMain.handle('download-video', async (_event, videoId, songInfo) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`
    const filePath = join(downloadFolder, `${videoId}.mp4`)

    try {
      // Save metadata to DB
      db.prepare('INSERT OR IGNORE INTO songs (id, title, artist) VALUES (?, ?, ?)').run(
        videoId,
        songInfo.name,
        songInfo.artist.name
      )

      db.prepare(
        'INSERT OR IGNORE INTO downloads (song_id, file_path, status) VALUES (?, ?, ?)'
      ).run(videoId, filePath, 'downloading')

      // Start download in background
      youtubedl(url, {
        output: filePath,
        format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        noCheckCertificates: true
      })
        .then(() => {
          db.prepare('UPDATE downloads SET status = ? WHERE song_id = ?').run('completed', videoId)
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-progress', { videoId, status: 'completed' })
          }
        })
        .catch((err) => {
          console.error('Download failed', err)
          db.prepare('UPDATE downloads SET status = ? WHERE song_id = ?').run('failed', videoId)
        })

      return { status: 'started' }
    } catch (error) {
      console.error('IPC download handler failed', error)
      throw error
    }
  })

  ipcMain.handle('get-download-status', async (_event, videoId) => {
    const row = db.prepare('SELECT * FROM downloads WHERE song_id = ?').get(videoId)
    return row || null
  })
}
