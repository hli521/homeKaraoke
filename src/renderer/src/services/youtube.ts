export type YouTubeAudioMode = 'original' | 'karaoke'

export type LyricWord = {
  text: string
  startTime: number
  endTime: number
}

export type LyricLine = {
  text: string
  startTime: number
  endTime: number
  words: LyricWord[]
}

export type CachedKtvSong = {
  songKey: string
  title: string
  artist: string
  audioMode: YouTubeAudioMode
  youtubeId: string | null
  audioUrl: string
  lyrics: LyricLine[]
}

export const searchYouTubeKaraoke = async (
  artist: string,
  song: string,
  audioMode: YouTubeAudioMode
): Promise<string | null> => {
  try {
    const videoId = await window.api.youtubeSearch({ artist, song, audioMode })
    return videoId
  } catch (error) {
    console.error('YouTube search failed', error)
    return null
  }
}

export const getCachedKtvSong = async (
  artist: string,
  title: string,
  audioMode: YouTubeAudioMode
): Promise<CachedKtvSong | null> => {
  return await window.api.getCachedSong({ artist, title, audioMode })
}

export const prepareCachedKtvSong = async (
  artist: string,
  title: string,
  audioMode: YouTubeAudioMode,
  youtubeId: string
): Promise<CachedKtvSong | null> => {
  return await window.api.prepareCachedSong({ artist, title, audioMode, youtubeId })
}
