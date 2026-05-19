import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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

// Custom APIs for renderer
const api = {
  // Metadata
  fetchTopTracks: (countryCode: string) => ipcRenderer.invoke('fetch-top-tracks', countryCode),
  fetchTopArtists: (countryCode: string) => ipcRenderer.invoke('fetch-top-artists', countryCode),
  searchArtists: (term: string, country?: string) =>
    ipcRenderer.invoke('search-artists', term, country),
  fetchArtistTopTracks: (artistId: string | number, country?: string) =>
    ipcRenderer.invoke('fetch-artist-top-tracks', artistId, country),
  searchTracks: (term: string, country?: string) =>
    ipcRenderer.invoke('search-tracks', term, country),
  youtubeSearch: (request: YouTubeSearchRequest) => ipcRenderer.invoke('youtube-search', request),
  youtubeHasSource: (request: YouTubeSearchRequest) =>
    ipcRenderer.invoke('youtube-has-source', request),

  // Downloads
  downloadVideo: (videoId: string, songInfo: SongInfo) =>
    ipcRenderer.invoke('download-video', videoId, songInfo),
  getDownloadStatus: (videoId: string) => ipcRenderer.invoke('get-download-status', videoId),
  onDownloadProgress: (callback: (value: DownloadProgress) => void): (() => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, value: DownloadProgress): void =>
      callback(value)
    ipcRenderer.on('download-progress', subscription)
    return () => {
      ipcRenderer.removeListener('download-progress', subscription)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
