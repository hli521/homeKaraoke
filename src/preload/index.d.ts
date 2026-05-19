import { ElectronAPI } from '@electron-toolkit/preload'

type SongInfo = {
  name: string
  artist: { name: string }
}

type DownloadProgress = {
  videoId: string
  status: string
}

type YouTubeSearchRequest = {
  artist: string
  song: string
  audioMode: 'original' | 'karaoke'
}

type KaraokeAPI = {
  fetchTopTracks: (countryCode: string) => Promise<unknown[]>
  fetchTopArtists: (countryCode: string) => Promise<unknown[]>
  searchArtists: (term: string, country?: string) => Promise<unknown[]>
  fetchArtistTopTracks: (artistId: string | number, country?: string) => Promise<unknown[]>
  searchTracks: (term: string, country?: string) => Promise<unknown[]>
  youtubeSearch: (request: YouTubeSearchRequest) => Promise<string | null>
  youtubeHasSource: (request: YouTubeSearchRequest) => Promise<boolean>
  downloadVideo: (videoId: string, songInfo: SongInfo) => Promise<unknown>
  getDownloadStatus: (videoId: string) => Promise<unknown>
  onDownloadProgress: (callback: (value: DownloadProgress) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KaraokeAPI
  }
}
