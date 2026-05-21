import { ipcMain, app, BrowserWindow } from 'electron'
import youtubedl from 'youtube-dl-exec'
import { basename, join } from 'path'
import { mkdirSync, existsSync, readdirSync, readFileSync, unlinkSync } from 'fs'
import { execFile } from 'child_process'
import { cpus } from 'os'
import { promisify } from 'util'
import axios from 'axios'
import ytSearch from 'yt-search'
import db from './db'

const downloadFolder = join(app.getPath('downloads'), 'KaraokeApp')
const cacheFolder = join(app.getPath('userData'), 'cached-songs')
const ITUNES_BASE_URL = 'https://itunes.apple.com'
const APPLE_RSS_BASE_URL = 'https://rss.applemarketingtools.com/api/v2'
const LRCLIB_BASE_URL = 'https://lrclib.net/api'
const TIMING_VERSION = 5
const execFileAsync = promisify(execFile)

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

type CachedSongRequest = {
  title: string
  artist: string
  audioMode: YouTubeAudioMode
}

type PrepareSongRequest = CachedSongRequest & {
  youtubeId: string
}

type LyricWord = {
  text: string
  startTime: number
  endTime: number
}

type LyricLine = {
  text: string
  startTime: number
  endTime: number
  words: LyricWord[]
}

type LyricTimingToken = {
  text: string
  weight: number
  pauseAfter: number
}

type CachedSong = {
  songKey: string
  title: string
  artist: string
  audioMode: YouTubeAudioMode
  youtubeId: string | null
  audioUrl: string
  lyrics: LyricLine[]
}

type CachedSongRow = {
  song_key: string
  title: string
  artist: string
  audio_mode: YouTubeAudioMode
  youtube_id: string | null
  audio_path: string | null
  lyrics_json: string | null
  timing_version: number | null
}

type WhisperToken = {
  text?: string
  timestamps?: {
    from?: string | number
    to?: string | number
  }
  offsets?: {
    from?: number
    to?: number
  }
}

type WhisperSegment = {
  text?: string
  timestamps?: {
    from?: string | number
    to?: string | number
  }
  offsets?: {
    from?: number
    to?: number
  }
  tokens?: WhisperToken[]
}

type WhisperJson = {
  transcription?: WhisperSegment[]
  segments?: WhisperSegment[]
}

type WhisperRuntimePaths = {
  bin: string
  model: string
  backendPath?: string
}

type LocalAsrResult = {
  lyrics: LyricLine[]
  usedAsr: boolean
}

type AlignmentToken = {
  text: string
  lineIndex: number
  wordIndex: number
  startTime: number
  endTime: number
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

const getSongKey = ({ title, artist, audioMode }: CachedSongRequest): string =>
  normalizeSearchText(`${artist} ${title} ${audioMode}`).replace(/\s+/g, '-')

const getLocalFileUrl = (filePath: string): string => `local-file://${encodeURIComponent(filePath)}`

const getBundledWhisperPlatform = (): string | null => {
  if (process.platform === 'darwin') return `darwin-${process.arch}`
  if (process.platform === 'win32') return `win-${process.arch}`
  if (process.platform === 'linux') return `linux-${process.arch}`
  return null
}

const getBundledWhisperRoot = (): string =>
  app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')

const getBundledGgmlBackendPath = (): string | undefined => {
  const explicitBackendPath = process.env.GGML_BACKEND_PATH
  if (explicitBackendPath) return explicitBackendPath

  const backendRoot = join(getBundledWhisperRoot(), 'whisper', 'libexec')
  const cpuModel = cpus()[0]?.model.toLowerCase() || ''
  const backendName =
    process.platform === 'darwin' && process.arch === 'arm64'
      ? cpuModel.includes('m4')
        ? 'libggml-cpu-apple_m4.so'
        : cpuModel.includes('m2') || cpuModel.includes('m3')
          ? 'libggml-cpu-apple_m2_m3.so'
          : 'libggml-cpu-apple_m1.so'
      : undefined

  if (!backendName) return undefined

  const backendPath = join(backendRoot, backendName)
  return existsSync(backendPath) ? backendPath : undefined
}

const getBundledWhisperPaths = (): WhisperRuntimePaths | null => {
  const platform = getBundledWhisperPlatform()
  if (!platform) return null

  const binName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  const whisperRoot = join(getBundledWhisperRoot(), 'whisper', platform)
  const bin = join(whisperRoot, binName)
  const modelName = process.env.WHISPER_MODEL_NAME || 'ggml-small.bin'
  const model = join(whisperRoot, modelName)
  const backendPath = getBundledGgmlBackendPath()

  return existsSync(bin) && existsSync(model) ? { bin, model, backendPath } : null
}

const parseTimestamp = (minutes: string, seconds: string): number =>
  Number(minutes) * 60 + Number(seconds)

const parseFlexibleTimestamp = (value: string | number | undefined): number | null => {
  if (value === undefined) return null
  if (typeof value === 'number') {
    if (value > 1000) return value / 1000
    if (value > 100) return value / 100
    return value
  }

  const normalizedValue = value.replace(',', '.')
  if (normalizedValue.includes(':')) return parseVttTimestamp(normalizedValue)
  const numericValue = Number(normalizedValue)
  return Number.isFinite(numericValue) ? numericValue : null
}

const parseVttTimestamp = (timestamp: string): number => {
  const parts = timestamp.split(':')
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
  }
  return Number(parts[0]) * 60 + Number(parts[1])
}

const decodeVttText = (text: string): string =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const getLatinSyllableWeight = (word: string): number => {
  const normalizedWord = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!normalizedWord) return 1

  const syllableGroups = normalizedWord.match(/[aeiouy]+/g)?.length || 1
  const silentEndingPenalty = normalizedWord.endsWith('e') && syllableGroups > 1 ? 0.35 : 0
  return Math.max(1, syllableGroups - silentEndingPenalty)
}

const isCjkOrKana = (char: string): boolean => /[\u3400-\u9fff\u3040-\u30ff]/u.test(char)

const isHangul = (char: string): boolean => /[\uac00-\ud7af]/u.test(char)

const isWordLikeCharacter = (char: string): boolean => /[\p{L}\p{N}]/u.test(char)

const getPunctuationPause = (char: string): number => {
  if (/[，,、]/u.test(char)) return 0.16
  if (/[。.!！？?；;]/u.test(char)) return 0.28
  if (/[-—…]/u.test(char)) return 0.2
  return 0
}

const addPauseToLastToken = (tokens: LyricTimingToken[], pause: number): void => {
  if (tokens.length === 0 || pause === 0) return
  tokens[tokens.length - 1].pauseAfter += pause
}

const splitLyricTimingTokens = (text: string): LyricTimingToken[] => {
  const tokens: LyricTimingToken[] = []
  let latinBuffer = ''

  const flushLatinBuffer = (): void => {
    const tokenText = latinBuffer.trim()
    if (!tokenText) {
      latinBuffer = ''
      return
    }

    tokens.push({
      text: tokenText,
      weight: getLatinSyllableWeight(tokenText),
      pauseAfter: 0
    })
    latinBuffer = ''
  }

  for (const char of text) {
    if (isCjkOrKana(char)) {
      flushLatinBuffer()
      tokens.push({ text: char, weight: 1, pauseAfter: 0.015 })
      continue
    }

    if (isHangul(char)) {
      flushLatinBuffer()
      tokens.push({ text: char, weight: 0.85, pauseAfter: 0.015 })
      continue
    }

    if (isWordLikeCharacter(char) || /['’]/u.test(char)) {
      latinBuffer += char
      continue
    }

    flushLatinBuffer()
    addPauseToLastToken(tokens, getPunctuationPause(char))
  }

  flushLatinBuffer()
  return tokens
}

const estimateWordTimings = (text: string, startTime: number, endTime: number): LyricWord[] => {
  const tokens = splitLyricTimingTokens(text)
  if (tokens.length === 0) return []

  const lineDuration = Math.max(endTime - startTime, tokens.length * 0.12)
  const totalPause = Math.min(
    tokens.reduce((sum, token) => sum + token.pauseAfter, 0),
    lineDuration * 0.22
  )
  const singableDuration = Math.max(lineDuration - totalPause, lineDuration * 0.78)
  const totalWeight = tokens.reduce((sum, token) => sum + token.weight, 0)
  let cursor = startTime

  return tokens.map((token, index) => {
    const tokenDuration =
      index === tokens.length - 1
        ? Math.max(endTime - cursor, 0.12)
        : Math.max((singableDuration * token.weight) / totalWeight, 0.12)
    const tokenStartTime = cursor
    const tokenEndTime = Math.min(tokenStartTime + tokenDuration, endTime)

    cursor = Math.min(tokenEndTime + token.pauseAfter, endTime)
    return {
      text: token.text,
      startTime: tokenStartTime,
      endTime: tokenEndTime
    }
  })
}

const getWhisperTime = (
  item: {
    timestamps?: { from?: string | number; to?: string | number }
    offsets?: { from?: number; to?: number }
  },
  side: 'from' | 'to'
): number | null => {
  const timestamp = parseFlexibleTimestamp(item.timestamps?.[side])
  if (timestamp !== null) return timestamp

  const offset = item.offsets?.[side]
  return offset === undefined ? null : offset / 1000
}

const getWhisperSegments = (whisperJson: WhisperJson): WhisperSegment[] =>
  whisperJson.transcription || whisperJson.segments || []

const parseWhisperJsonLyrics = (jsonPath: string): LyricLine[] => {
  const whisperJson = JSON.parse(readFileSync(jsonPath, 'utf8')) as WhisperJson

  return getWhisperSegments(whisperJson)
    .map((segment) => {
      const segmentText = decodeVttText(segment.text || '')
      const startTime = getWhisperTime(segment, 'from')
      const endTime = getWhisperTime(segment, 'to')
      if (!segmentText || startTime === null || endTime === null || endTime <= startTime) {
        return null
      }

      const tokenWords =
        segment.tokens
          ?.map((token) => {
            const text = decodeVttText(token.text || '')
            const tokenStart = getWhisperTime(token, 'from')
            const tokenEnd = getWhisperTime(token, 'to')
            if (!text || tokenStart === null || tokenEnd === null || tokenEnd <= tokenStart) {
              return null
            }
            return { text, startTime: tokenStart, endTime: tokenEnd }
          })
          .filter((word): word is LyricWord => Boolean(word)) || []

      return {
        text: segmentText,
        startTime,
        endTime,
        words:
          tokenWords.length > 0 ? tokenWords : estimateWordTimings(segmentText, startTime, endTime)
      }
    })
    .filter((line): line is LyricLine => Boolean(line))
}

const normalizeAlignmentToken = (text: string): string =>
  normalizeSearchText(text).replace(/\s+/g, '')

const splitNormalizedAlignmentToken = (text: string): string[] => {
  const normalizedText = normalizeAlignmentToken(text)
  if (!normalizedText) return []

  const chars = [...normalizedText]
  if (chars.length > 1 && chars.every((char) => isCjkOrKana(char) || isHangul(char))) {
    return chars
  }

  return [normalizedText]
}

const flattenAlignmentTokens = (lyrics: LyricLine[]): AlignmentToken[] =>
  lyrics.flatMap((line, lineIndex) =>
    line.words.flatMap((word, wordIndex) => {
      const tokens = splitNormalizedAlignmentToken(word.text)
      if (tokens.length === 0) return []

      const duration = Math.max(word.endTime - word.startTime, 0.01)
      return tokens.map((token, tokenIndex) => ({
        text: token,
        lineIndex,
        wordIndex,
        startTime: word.startTime + (duration * tokenIndex) / tokens.length,
        endTime: word.startTime + (duration * (tokenIndex + 1)) / tokens.length
      }))
    })
  )

const getLcsAlignmentMatches = (
  lyricTokens: AlignmentToken[],
  asrTokens: AlignmentToken[]
): Array<{ lyric: AlignmentToken; asr: AlignmentToken }> => {
  const lyricLength = lyricTokens.length
  const asrLength = asrTokens.length
  if (lyricLength === 0 || asrLength === 0) return []

  const columns = asrLength + 1
  const scores = new Uint16Array((lyricLength + 1) * columns)

  for (let lyricIndex = lyricLength - 1; lyricIndex >= 0; lyricIndex -= 1) {
    for (let asrIndex = asrLength - 1; asrIndex >= 0; asrIndex -= 1) {
      const offset = lyricIndex * columns + asrIndex
      if (lyricTokens[lyricIndex].text === asrTokens[asrIndex].text) {
        scores[offset] = scores[(lyricIndex + 1) * columns + asrIndex + 1] + 1
      } else {
        scores[offset] = Math.max(
          scores[(lyricIndex + 1) * columns + asrIndex],
          scores[lyricIndex * columns + asrIndex + 1]
        )
      }
    }
  }

  const matches: Array<{ lyric: AlignmentToken; asr: AlignmentToken }> = []
  let lyricIndex = 0
  let asrIndex = 0
  while (lyricIndex < lyricLength && asrIndex < asrLength) {
    if (lyricTokens[lyricIndex].text === asrTokens[asrIndex].text) {
      matches.push({ lyric: lyricTokens[lyricIndex], asr: asrTokens[asrIndex] })
      lyricIndex += 1
      asrIndex += 1
      continue
    }

    if (
      scores[(lyricIndex + 1) * columns + asrIndex] >= scores[lyricIndex * columns + asrIndex + 1]
    ) {
      lyricIndex += 1
    } else {
      asrIndex += 1
    }
  }

  return matches
}

const interpolateWordTimings = (
  line: LyricLine,
  anchorTimings: Map<number, LyricWord>
): LyricWord[] => {
  if (anchorTimings.size === 0) return line.words

  const words = [...line.words]
  const anchorIndexes = [...anchorTimings.keys()].sort((a, b) => a - b)

  anchorIndexes.forEach((wordIndex) => {
    const anchor = anchorTimings.get(wordIndex)
    if (anchor) words[wordIndex] = anchor
  })

  const fillRange = (
    fromIndex: number,
    toIndex: number,
    startTime: number,
    endTime: number
  ): void => {
    if (fromIndex > toIndex) return
    const rangeText = words
      .slice(fromIndex, toIndex + 1)
      .map((word) => word.text)
      .join('')
    const estimates = estimateWordTimings(rangeText, startTime, Math.max(endTime, startTime + 0.12))
    for (let index = fromIndex; index <= toIndex; index += 1) {
      const estimate = estimates[index - fromIndex]
      if (estimate) {
        words[index] = {
          text: words[index].text,
          startTime: estimate.startTime,
          endTime: estimate.endTime
        }
      }
    }
  }

  const firstAnchor = anchorIndexes[0]
  const firstTiming = anchorTimings.get(firstAnchor)
  if (firstTiming && firstAnchor > 0) {
    const estimatedStart = Math.max(line.startTime, firstTiming.startTime - firstAnchor * 0.35)
    fillRange(0, firstAnchor - 1, estimatedStart, firstTiming.startTime)
  }

  anchorIndexes.forEach((wordIndex, anchorPosition) => {
    const nextAnchorIndex = anchorIndexes[anchorPosition + 1]
    if (nextAnchorIndex === undefined || nextAnchorIndex <= wordIndex + 1) return

    const currentTiming = anchorTimings.get(wordIndex)
    const nextTiming = anchorTimings.get(nextAnchorIndex)
    if (!currentTiming || !nextTiming) return
    fillRange(wordIndex + 1, nextAnchorIndex - 1, currentTiming.endTime, nextTiming.startTime)
  })

  const lastAnchor = anchorIndexes[anchorIndexes.length - 1]
  const lastTiming = anchorTimings.get(lastAnchor)
  if (lastTiming && lastAnchor < words.length - 1) {
    const estimatedEnd = Math.min(
      Math.max(line.endTime, lastTiming.endTime),
      lastTiming.endTime + (words.length - lastAnchor - 1) * 0.45
    )
    fillRange(lastAnchor + 1, words.length - 1, lastTiming.endTime, estimatedEnd)
  }

  return words
}

const alignLyricsWithAsr = (lyrics: LyricLine[], asrLyrics: LyricLine[]): LocalAsrResult => {
  if (lyrics.length === 0) return { lyrics: asrLyrics, usedAsr: asrLyrics.length > 0 }

  const lyricTokens = flattenAlignmentTokens(lyrics)
  const asrTokens = flattenAlignmentTokens(asrLyrics)
  if (lyricTokens.length === 0 || asrTokens.length === 0) return { lyrics, usedAsr: false }

  const matches = getLcsAlignmentMatches(lyricTokens, asrTokens)
  const anchorTimingsByLine = new Map<number, Map<number, LyricWord>>()

  matches.forEach(({ lyric, asr }) => {
    const lineAnchors = anchorTimingsByLine.get(lyric.lineIndex) || new Map<number, LyricWord>()
    const existingAnchor = lineAnchors.get(lyric.wordIndex)
    const nextAnchor = {
      text: lyrics[lyric.lineIndex].words[lyric.wordIndex].text,
      startTime: existingAnchor ? Math.min(existingAnchor.startTime, asr.startTime) : asr.startTime,
      endTime: existingAnchor ? Math.max(existingAnchor.endTime, asr.endTime) : asr.endTime
    }
    lineAnchors.set(lyric.wordIndex, nextAnchor)
    anchorTimingsByLine.set(lyric.lineIndex, lineAnchors)
  })

  const alignedLyrics = lyrics.map((line, lineIndex) => {
    const anchorTimings = anchorTimingsByLine.get(lineIndex)
    if (!anchorTimings || anchorTimings.size === 0) return line

    const alignedWords = interpolateWordTimings(line, anchorTimings)
    return {
      text: line.text,
      startTime: alignedWords[0].startTime,
      endTime: alignedWords[alignedWords.length - 1].endTime,
      words: alignedWords
    }
  })

  const matchRatio = matches.length / lyricTokens.length
  const usedAsr = matches.length >= 4 && matchRatio >= 0.25
  return { lyrics: usedAsr ? alignedLyrics : lyrics, usedAsr }
}

const runLocalAsrTranscription = async (
  audioPath: string,
  songKey: string
): Promise<LyricLine[]> => {
  const bundledWhisper = getBundledWhisperPaths()
  const whisperBin = process.env.WHISPER_CPP_BIN || process.env.WHISPER_BIN || bundledWhisper?.bin
  const whisperModel = process.env.WHISPER_MODEL_PATH || bundledWhisper?.model
  const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg'

  if (!whisperBin || !whisperModel || !existsSync(whisperBin) || !existsSync(whisperModel)) {
    console.warn('Local ASR skipped because Whisper binary or model was not found', {
      whisperBin,
      whisperModel
    })
    return []
  }

  const wavPath = join(cacheFolder, `${songKey}.align.wav`)
  const outputBase = join(cacheFolder, `${songKey}.whisper`)
  const jsonPath = `${outputBase}.json`

  try {
    if (existsSync(wavPath)) unlinkSync(wavPath)
    if (existsSync(jsonPath)) unlinkSync(jsonPath)

    console.info('Local ASR converting audio for Whisper', { audioPath, wavPath })
    await execFileAsync(ffmpegBin, ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', wavPath], {
      timeout: 120000
    })

    console.info('Local ASR running Whisper', {
      whisperBin,
      whisperModel,
      backendPath: bundledWhisper?.backendPath,
      outputBase
    })
    await execFileAsync(
      whisperBin,
      [
        '-m',
        whisperModel,
        '-f',
        wavPath,
        '-oj',
        '-of',
        outputBase,
        '-l',
        process.env.WHISPER_LANGUAGE || 'auto',
        '-ml',
        '1',
        ...(process.env.WHISPER_USE_GPU === '1' ? [] : ['-ng'])
      ],
      {
        timeout: 600000,
        env: {
          ...process.env,
          ...(bundledWhisper?.backendPath
            ? { GGML_BACKEND_PATH: process.env.GGML_BACKEND_PATH || bundledWhisper.backendPath }
            : {})
        }
      }
    )

    if (!existsSync(jsonPath)) return []
    return parseWhisperJsonLyrics(jsonPath)
  } catch (error) {
    console.error('Local ASR alignment failed', error)
    return []
  }
}

const runLocalAsrAlignment = async (
  audioPath: string,
  songKey: string,
  lyrics: LyricLine[]
): Promise<LocalAsrResult> => {
  const asrLyrics = await runLocalAsrTranscription(audioPath, songKey)
  return alignLyricsWithAsr(lyrics, asrLyrics)
}

const parseVttCueWords = (cueText: string, cueStart: number, cueEnd: number): LyricWord[] => {
  const timestampPattern = /<((?:\d+:)?\d{2}:\d{2}\.\d{3})>/g
  const matches = [...cueText.matchAll(timestampPattern)]

  if (matches.length === 0) {
    return estimateWordTimings(decodeVttText(cueText), cueStart, cueEnd)
  }

  const words: LyricWord[] = []
  matches.forEach((match, index) => {
    const segmentStart = match.index + match[0].length
    const segmentEnd = matches[index + 1]?.index ?? cueText.length
    const segmentText = decodeVttText(cueText.slice(segmentStart, segmentEnd))
    if (!segmentText) return

    const startTime = parseVttTimestamp(match[1])
    const endTime = matches[index + 1] ? parseVttTimestamp(matches[index + 1][1]) : cueEnd
    words.push(...estimateWordTimings(segmentText, startTime, endTime))
  })

  return words
}

const parseVttLyrics = (vttText: string): LyricLine[] => {
  return vttText
    .replace(/\r/g, '')
    .split(/\n\n+/)
    .map((cue) => {
      const lines = cue.split('\n').filter(Boolean)
      const timingIndex = lines.findIndex((line) => line.includes('-->'))
      if (timingIndex === -1) return null

      const timingMatch = lines[timingIndex].match(
        /((?:\d+:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}\.\d{3})/
      )
      if (!timingMatch) return null

      const cueText = lines.slice(timingIndex + 1).join(' ')
      const text = decodeVttText(cueText.replace(/<((?:\d+:)?\d{2}:\d{2}\.\d{3})>/g, ' '))
      if (!text || /^WEBVTT$/i.test(text)) return null

      const startTime = parseVttTimestamp(timingMatch[1])
      const endTime = parseVttTimestamp(timingMatch[2])
      return {
        text,
        startTime,
        endTime,
        words: parseVttCueWords(cueText, startTime, endTime)
      }
    })
    .filter((line): line is LyricLine => Boolean(line && line.words.length > 0))
}

const parseSyncedLyrics = (syncedLyrics: string): LyricLine[] => {
  const parsedLines = syncedLyrics
    .split('\n')
    .map((line) => {
      const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/)
      if (!match) return null
      const text = match[3].trim()
      if (!text) return null
      return {
        text,
        startTime: parseTimestamp(match[1], match[2])
      }
    })
    .filter((line): line is { text: string; startTime: number } => Boolean(line))

  return parsedLines.map((line, index) => {
    const nextLine = parsedLines[index + 1]
    const endTime = nextLine ? nextLine.startTime : line.startTime + 4

    return {
      text: line.text,
      startTime: line.startTime,
      endTime,
      words: estimateWordTimings(line.text, line.startTime, endTime)
    }
  })
}

const fetchSyncedLyrics = async ({ title, artist }: CachedSongRequest): Promise<LyricLine[]> => {
  const response = await axios.get(`${LRCLIB_BASE_URL}/get`, {
    headers: { 'User-Agent': 'karaoke-app/1.0.0' },
    params: {
      track_name: title,
      artist_name: artist
    }
  })
  const syncedLyrics = response.data?.syncedLyrics
  if (!syncedLyrics) return []
  return parseSyncedLyrics(syncedLyrics)
}

const cleanupCaptionFiles = (captionPrefix: string): void => {
  readdirSync(cacheFolder)
    .filter((fileName) => fileName.startsWith(captionPrefix))
    .forEach((fileName) => {
      try {
        unlinkSync(join(cacheFolder, fileName))
      } catch (error) {
        console.error('Failed to remove old caption file', error)
      }
    })
}

const captionLanguagePriority = ['zh-Hant', 'zh-Hans', 'zh', 'ja', 'ko', 'en']

const getCaptionFiles = (captionPrefix: string): string[] =>
  readdirSync(cacheFolder)
    .filter((fileName) => fileName.startsWith(captionPrefix) && fileName.endsWith('.vtt'))
    .sort((a, b) => {
      const getPriority = (fileName: string): number => {
        const baseName = basename(fileName)
        const index = captionLanguagePriority.findIndex((language) =>
          baseName.includes(`.${language}.`)
        )
        return index === -1 ? captionLanguagePriority.length : index
      }
      return getPriority(a) - getPriority(b)
    })

const parseCaptionFiles = (captionPrefix: string): LyricLine[] => {
  for (const captionFile of getCaptionFiles(captionPrefix)) {
    const lyrics = parseVttLyrics(readFileSync(join(cacheFolder, captionFile), 'utf8'))
    if (lyrics.length > 0) return lyrics
  }

  return []
}

const isRateLimitedCaptionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''
  return `${error.message} ${stderr}`.includes('HTTP Error 429')
}

const fetchYouTubeCaptionLyrics = async (
  youtubeId: string,
  songKey: string
): Promise<LyricLine[]> => {
  const captionPrefix = `${songKey}.captions`
  const captionOutput = join(cacheFolder, captionPrefix)
  cleanupCaptionFiles(captionPrefix)

  try {
    await youtubedl(`https://www.youtube.com/watch?v=${youtubeId}`, {
      skipDownload: true,
      writeSub: true,
      subLang: captionLanguagePriority.join(','),
      subFormat: 'vtt',
      output: captionOutput,
      noCheckCertificates: true
    })
  } catch (error) {
    if (isRateLimitedCaptionError(error)) {
      console.warn('YouTube caption download rate limited; falling back to other lyric sources')
    } else {
      console.warn('YouTube caption download failed; falling back to other lyric sources', error)
    }
  }

  const manualLyrics = parseCaptionFiles(captionPrefix)
  if (manualLyrics.length > 0) return manualLyrics

  try {
    await youtubedl(`https://www.youtube.com/watch?v=${youtubeId}`, {
      skipDownload: true,
      writeAutoSub: true,
      subLang: captionLanguagePriority.join(','),
      subFormat: 'vtt',
      output: captionOutput,
      noCheckCertificates: true
    })
  } catch (error) {
    if (isRateLimitedCaptionError(error)) {
      console.warn(
        'YouTube auto-caption download rate limited; falling back to other lyric sources'
      )
    } else {
      console.warn(
        'YouTube auto-caption download failed; falling back to other lyric sources',
        error
      )
    }
  }

  return parseCaptionFiles(captionPrefix)
}

const toCachedSong = (row: CachedSongRow): CachedSong | null => {
  if (!row.audio_path || !row.lyrics_json || !existsSync(row.audio_path)) return null

  try {
    return {
      songKey: row.song_key,
      title: row.title,
      artist: row.artist,
      audioMode: row.audio_mode,
      youtubeId: row.youtube_id,
      audioUrl: getLocalFileUrl(row.audio_path),
      lyrics: JSON.parse(row.lyrics_json) as LyricLine[]
    }
  } catch (error) {
    console.error('Failed to parse cached lyrics', error)
    return null
  }
}

const getCachedSong = (request: CachedSongRequest): CachedSong | null => {
  const row = db
    .prepare('SELECT * FROM cached_songs WHERE song_key = ? AND status = ? AND timing_version = ?')
    .get(getSongKey(request), 'ready', TIMING_VERSION) as CachedSongRow | undefined

  return row ? toCachedSong(row) : null
}

const prepareCachedSong = async (request: PrepareSongRequest): Promise<CachedSong | null> => {
  const songKey = getSongKey(request)
  const cachedSong = getCachedSong(request)
  if (cachedSong) return cachedSong

  mkdirSync(cacheFolder, { recursive: true })
  const audioPath = join(cacheFolder, `${songKey}.m4a`)

  db.prepare(
    `INSERT INTO cached_songs (song_key, title, artist, audio_mode, youtube_id, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(song_key) DO UPDATE SET
       youtube_id = excluded.youtube_id,
       status = excluded.status,
       updated_at = CURRENT_TIMESTAMP`
  ).run(songKey, request.title, request.artist, request.audioMode, request.youtubeId, 'downloading')

  await youtubedl(`https://www.youtube.com/watch?v=${request.youtubeId}`, {
    output: audioPath,
    format: 'bestaudio[ext=m4a]/bestaudio',
    noCheckCertificates: true
  })

  let lyrics = await fetchYouTubeCaptionLyrics(request.youtubeId, songKey)
  let lyricsSource = 'youtube-captions'
  if (lyrics.length === 0) {
    lyrics = await fetchSyncedLyrics(request)
    lyricsSource = 'lrclib'
  }

  if (lyrics.length > 0) {
    const asrAlignedLyrics = await runLocalAsrAlignment(audioPath, songKey, lyrics)
    if (asrAlignedLyrics.usedAsr) {
      lyrics = asrAlignedLyrics.lyrics
      lyricsSource = `${lyricsSource}+local-asr`
    }
  }

  if (lyrics.length === 0) {
    lyrics = await runLocalAsrTranscription(audioPath, songKey)
    lyricsSource = 'local-asr'
  }

  if (lyrics.length === 0) {
    db.prepare(
      'UPDATE cached_songs SET status = ?, audio_path = ?, updated_at = CURRENT_TIMESTAMP WHERE song_key = ?'
    ).run('missing-lyrics', audioPath, songKey)
    return null
  }

  db.prepare(
    `UPDATE cached_songs
     SET audio_path = ?, lyrics_json = ?, lyrics_source = ?, timing_version = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE song_key = ?`
  ).run(audioPath, JSON.stringify(lyrics), lyricsSource, TIMING_VERSION, 'ready', songKey)

  return getCachedSong(request)
}

if (!existsSync(downloadFolder)) {
  mkdirSync(downloadFolder, { recursive: true })
}
if (!existsSync(cacheFolder)) {
  mkdirSync(cacheFolder, { recursive: true })
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

  ipcMain.handle('get-cached-song', async (_event, request: CachedSongRequest) =>
    getCachedSong(request)
  )

  ipcMain.handle('prepare-cached-song', async (_event, request: PrepareSongRequest) => {
    try {
      return await prepareCachedSong(request)
    } catch (error) {
      console.error('prepare-cached-song failed', error)
      db.prepare(
        'UPDATE cached_songs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE song_key = ?'
      ).run('failed', getSongKey(request))
      return null
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
