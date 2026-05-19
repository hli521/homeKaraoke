import { useState } from 'react'
import type { ReactElement } from 'react'
import { Search, Music, Mic2, ArrowLeft, Plus, X } from 'lucide-react'
import { searchArtists, searchTracks } from '../../services/music-metadata'
import type { ArtistResult, TrackResult } from '../../services/music-metadata'
import { hasYouTubeKaraokeSource, searchYouTubeKaraoke } from '../../services/youtube'
import type { YouTubeAudioMode } from '../../services/youtube'
import Player from '../Player/Player'
import AudioModeToggle from '../AudioModeToggle/AudioModeToggle'

type Region = {
  id: string
  name: string
  code: string
  famousArtists: string[]
}

const regions = [
  {
    id: 'china',
    name: 'China',
    code: 'cn',
    famousArtists: [
      '周深 (Zhou Shen)',
      '那英 (Na Ying)',
      '薛之谦 (Joker Xue)',
      '李荣浩 (Li Ronghao)',
      '华晨宇 (Hua Chenyu)',
      '毛不易 (Mao Buyi)',
      '张碧晨 (Zhang Bichen)',
      '许嵩 (Vae)',
      '张杰 (Jason Zhang)',
      '李宇春 (Chris Lee)',
      '张靓颖 (Jane Zhang)',
      '汪峰 (Wang Feng)',
      '韩红 (Han Hong)',
      '赵雷 (Zhao Lei)',
      '刀郎 (Dao Lang)',
      '郁可唯 (Yisa Yu)'
    ]
  },
  {
    id: 'hongkong',
    name: 'Hong Kong',
    code: 'hk',
    famousArtists: [
      '張國榮 (Leslie Cheung)',
      '梅艷芳 (Anita Mui)',
      'Beyond',
      '張敬軒 (Hins Cheung)',
      '容祖兒 (Joey Yung)',
      '楊千嬅 (Miriam Yeung)',
      '李克勤 (Hacken Lee)',
      '古巨基 (Leo Ku)',
      '劉德華 (Andy Lau)',
      '郭富城 (Aaron Kwok)'
    ]
  },
  {
    id: 'taiwan',
    name: 'Taiwan',
    code: 'tw',
    famousArtists: [
      '周杰倫 (Jay Chou)',
      '五月天 (Mayday)',
      '蔡依林 (Jolin Tsai)',
      'A-Lin',
      '田馥甄 (Hebe Tien)',
      '蕭敬騰 (Jam Hsiao)',
      '林宥嘉 (Yoga Lin)',
      '楊丞琳 (Rainie Yang)',
      'S.H.E',
      '羅大佑 (Lo Ta-yu)',
      '李宗盛 (Jonathan Lee)',
      '張惠妹 (A-Mei)'
    ]
  },
  {
    id: 'japan',
    name: 'Japan',
    code: 'jp',
    famousArtists: [
      '宇多田ヒカル (Utada Hikaru)',
      '米津玄師 (Kenshi Yonezu)',
      'YOASOBI',
      'Official HIGE DANdism',
      'あいみょん (Aimyon)',
      'LiSA',
      'King Gnu',
      'Radwimps',
      '安室奈美恵 (Namie Amuro)',
      '浜崎あゆみ (Ayumi Hamasaki)'
    ]
  },
  {
    id: 'korea',
    name: 'Korea',
    code: 'kr',
    famousArtists: [
      '방탄소년단 (BTS)',
      'BLACKPINK',
      '아이유 (IU)',
      'TWICE',
      'NewJeans',
      'IVE',
      'EXO',
      'Big Bang',
      "Girls' Generation",
      'Psy'
    ]
  },
  {
    id: 'usa',
    name: 'USA',
    code: 'us',
    famousArtists: [
      'Taylor Swift',
      'Bruno Mars',
      'Billie Eilish',
      'Olivia Rodrigo',
      'Post Malone',
      'Beyoncé',
      'Lady Gaga',
      'Ariana Grande',
      'Kendrick Lamar',
      'SZA',
      'Miley Cyrus',
      'Mariah Carey'
    ]
  }
]

type CustomArtistsByRegion = Record<string, string[]>

const CUSTOM_ARTISTS_STORAGE_KEY = 'karaoke.customArtistsByRegion'
const REMOVED_ARTISTS_STORAGE_KEY = 'karaoke.removedArtistsByRegion'
const MAX_SONG_SOURCE_CHECKS = 12

const readCustomArtists = (): CustomArtistsByRegion => {
  try {
    const storedArtists = window.localStorage.getItem(CUSTOM_ARTISTS_STORAGE_KEY)
    return storedArtists ? (JSON.parse(storedArtists) as CustomArtistsByRegion) : {}
  } catch (error) {
    console.error('Failed to read custom artists', error)
    return {}
  }
}

const writeCustomArtists = (customArtists: CustomArtistsByRegion): void => {
  window.localStorage.setItem(CUSTOM_ARTISTS_STORAGE_KEY, JSON.stringify(customArtists))
}

const readRemovedArtists = (): CustomArtistsByRegion => {
  try {
    const storedArtists = window.localStorage.getItem(REMOVED_ARTISTS_STORAGE_KEY)
    return storedArtists ? (JSON.parse(storedArtists) as CustomArtistsByRegion) : {}
  } catch (error) {
    console.error('Failed to read removed artists', error)
    return {}
  }
}

const writeRemovedArtists = (removedArtists: CustomArtistsByRegion): void => {
  window.localStorage.setItem(REMOVED_ARTISTS_STORAGE_KEY, JSON.stringify(removedArtists))
}

const normalizeArtistName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const rankArtistMatch = (artistName: string, query: string): number => {
  const name = normalizeArtistName(artistName)
  const term = normalizeArtistName(query)

  if (!name || !term) return 0
  if (name === term) return 100
  if (name.startsWith(`${term} `) || name.startsWith(term)) return 80
  if (name.split(' ').includes(term)) return 60
  if (name.includes(term)) return 35
  return 0
}

const getTopRelevantArtists = (artists: ArtistResult[], query: string): ArtistResult[] => {
  const seen = new Set<string>()

  return artists
    .map((artist) => ({
      ...artist,
      relevance: rankArtistMatch(artist.name, query)
    }))
    .filter((artist) => artist.relevance > 0)
    .filter((artist) => {
      const normalizedName = normalizeArtistName(artist.name)
      if (seen.has(normalizedName)) return false
      seen.add(normalizedName)
      return true
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5)
}

const filterTracksWithVideoSource = async (
  tracks: TrackResult[],
  audioMode: YouTubeAudioMode
): Promise<TrackResult[]> => {
  const candidateTracks = tracks.slice(0, MAX_SONG_SOURCE_CHECKS)
  const sourceChecks = await Promise.all(
    candidateTracks.map(async (track) => ({
      track,
      hasSource: await hasYouTubeKaraokeSource(track.artist.name, track.name, audioMode)
    }))
  )

  return sourceChecks.filter((result) => result.hasSource).map((result) => result.track)
}

type DisplayArtist = {
  id?: number
  name: string
  source?: 'default' | 'custom' | 'search'
}

type DiscoveryProps = {
  audioMode: YouTubeAudioMode
  onAudioModeChange: (audioMode: YouTubeAudioMode) => void
}

const getRegionDisplayArtists = (
  region: Region,
  customArtistsByRegion: CustomArtistsByRegion,
  removedArtistsByRegion: CustomArtistsByRegion
): DisplayArtist[] => {
  const seen = new Set<string>()
  const removedArtists = new Set(
    (removedArtistsByRegion[region.id] || []).map((artistName) => normalizeArtistName(artistName))
  )

  return [
    ...region.famousArtists.map((name) => ({ name, source: 'default' as const })),
    ...(customArtistsByRegion[region.id] || []).map((name) => ({ name, source: 'custom' as const }))
  ].filter((name) => {
    const normalizedName = normalizeArtistName(name.name)
    if (!normalizedName || seen.has(normalizedName) || removedArtists.has(normalizedName)) {
      return false
    }
    seen.add(normalizedName)
    return true
  })
}

const Discovery = ({ audioMode, onAudioModeChange }: DiscoveryProps): ReactElement => {
  const [customArtistsByRegion, setCustomArtistsByRegion] =
    useState<CustomArtistsByRegion>(readCustomArtists)
  const [removedArtistsByRegion, setRemovedArtistsByRegion] =
    useState<CustomArtistsByRegion>(readRemovedArtists)
  const [activeRegion, setActiveRegion] = useState<Region>(regions[0])
  const [displayArtists, setDisplayArtists] = useState<DisplayArtist[]>(
    getRegionDisplayArtists(regions[0], customArtistsByRegion, removedArtistsByRegion)
  )
  const [displayTracks, setDisplayTracks] = useState<TrackResult[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [newArtistName, setNewArtistName] = useState('')
  const [isAddingArtist, setIsAddingArtist] = useState(false)
  const [loading, setLoading] = useState(false)

  const [selectedSong, setSelectedSong] = useState<TrackResult | null>(null)
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)
  const [videoSearchStatus, setVideoSearchStatus] = useState<'searching' | 'found' | 'not-found'>(
    'not-found'
  )

  const loadInitialArtists = (
    region: Region = activeRegion,
    nextCustomArtistsByRegion: CustomArtistsByRegion = customArtistsByRegion,
    nextRemovedArtistsByRegion: CustomArtistsByRegion = removedArtistsByRegion
  ): void => {
    setDisplayArtists(
      getRegionDisplayArtists(region, nextCustomArtistsByRegion, nextRemovedArtistsByRegion)
    )
    setDisplayTracks([])
  }

  const saveArtistShortcut = (): void => {
    const trimmedArtistName = newArtistName.trim()
    if (!trimmedArtistName) return

    const existingArtistNames = getRegionDisplayArtists(
      activeRegion,
      customArtistsByRegion,
      removedArtistsByRegion
    ).map((artist) => artist.name)
    const normalizedArtistName = normalizeArtistName(trimmedArtistName)
    const alreadyExists = existingArtistNames.some(
      (existingArtistName) => normalizeArtistName(existingArtistName) === normalizedArtistName
    )

    if (alreadyExists) {
      return
    }

    const nextRemovedArtists = (removedArtistsByRegion[activeRegion.id] || []).filter(
      (removedArtistName) => normalizeArtistName(removedArtistName) !== normalizedArtistName
    )
    const nextCustomArtistsByRegion = {
      ...customArtistsByRegion,
      [activeRegion.id]: [...(customArtistsByRegion[activeRegion.id] || []), trimmedArtistName]
    }
    const nextRemovedArtistsByRegion = {
      ...removedArtistsByRegion,
      [activeRegion.id]: nextRemovedArtists
    }

    setCustomArtistsByRegion(nextCustomArtistsByRegion)
    setRemovedArtistsByRegion(nextRemovedArtistsByRegion)
    writeCustomArtists(nextCustomArtistsByRegion)
    writeRemovedArtists(nextRemovedArtistsByRegion)
    loadInitialArtists(activeRegion, nextCustomArtistsByRegion, nextRemovedArtistsByRegion)
    setNewArtistName('')
    setIsAddingArtist(false)
  }

  const cancelArtistShortcut = (): void => {
    setNewArtistName('')
    setIsAddingArtist(false)
  }

  const removeArtistShortcut = (artist: DisplayArtist): void => {
    const normalizedArtistName = normalizeArtistName(artist.name)
    const nextCustomArtists = (customArtistsByRegion[activeRegion.id] || []).filter(
      (customArtistName) => normalizeArtistName(customArtistName) !== normalizedArtistName
    )
    const nextRemovedArtists = Array.from(
      new Set([...(removedArtistsByRegion[activeRegion.id] || []), artist.name])
    )

    const nextCustomArtistsByRegion = {
      ...customArtistsByRegion,
      [activeRegion.id]: nextCustomArtists
    }
    const nextRemovedArtistsByRegion = {
      ...removedArtistsByRegion,
      [activeRegion.id]: nextRemovedArtists
    }

    setCustomArtistsByRegion(nextCustomArtistsByRegion)
    setRemovedArtistsByRegion(nextRemovedArtistsByRegion)
    writeCustomArtists(nextCustomArtistsByRegion)
    writeRemovedArtists(nextRemovedArtistsByRegion)
    loadInitialArtists(activeRegion, nextCustomArtistsByRegion, nextRemovedArtistsByRegion)
  }

  const handleSearch = async (query: string): Promise<void> => {
    if (!query) {
      setSearchQuery('')
      return
    }
    setLoading(true)
    setSearchQuery(query)
    try {
      const artists = await searchArtists(query, activeRegion.code)
      setDisplayArtists(
        getTopRelevantArtists(artists, query).map((artist) => ({
          name: artist.name,
          id: artist.artistId,
          source: 'search'
        }))
      )

      const songResults = await searchTracks(query, activeRegion.code)
      const tracksWithSources = await filterTracksWithVideoSource(songResults || [], audioMode)
      setDisplayTracks(tracksWithSources)
    } catch (error) {
      console.error('Search failed', error)
    } finally {
      setLoading(false)
    }
  }

  const playSong = async (track: TrackResult): Promise<void> => {
    setSelectedSong(track)
    setCurrentVideoId(null)
    setVideoSearchStatus('searching')
    setLoading(true)
    try {
      const videoId = await searchYouTubeKaraoke(track.artist.name, track.name, audioMode)
      setCurrentVideoId(videoId)
      setVideoSearchStatus(videoId ? 'found' : 'not-found')
    } catch (error) {
      console.error('Failed to find video', error)
      setCurrentVideoId(null)
      setVideoSearchStatus('not-found')
    } finally {
      setLoading(false)
    }
  }

  const resetView = (): void => {
    setSearchQuery('')
    loadInitialArtists()
  }

  return (
    <div className="discovery-container">
      {selectedSong && (
        <Player
          song={selectedSong}
          videoId={currentVideoId}
          videoSearchStatus={videoSearchStatus}
          audioMode={audioMode}
          onAudioModeChange={onAudioModeChange}
          onClose={() => {
            setSelectedSong(null)
            setCurrentVideoId(null)
            setVideoSearchStatus('not-found')
          }}
        />
      )}
      <header className="ktv-header">
        <div className="search-bar-container">
          {searchQuery && (
            <button className="back-btn" onClick={resetView}>
              <ArrowLeft size={24} />
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSearch(searchQuery)
            }}
            className="search-form"
          >
            <Search className="search-icon" size={24} />
            <input
              type="text"
              placeholder="Search Artist or Song..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ktv-input"
            />
          </form>
          <AudioModeToggle
            audioMode={audioMode}
            onAudioModeChange={onAudioModeChange}
            className="header-audio-toggle"
          />
        </div>
        {!searchQuery && (
          <div className="header-controls">
            <div className="region-tabs">
              {regions.map((region) => (
                <button
                  key={region.id}
                  className={`region-tab ${activeRegion.id === region.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveRegion(region)
                    setSearchQuery('')
                    loadInitialArtists(region)
                  }}
                >
                  {region.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="ktv-content">
        {loading && !searchQuery ? (
          <div className="loading-state">Loading Library...</div>
        ) : (
          <div className="section-container">
            {(displayArtists.length > 0 || !searchQuery) && (
              <>
                <h2 className="section-title">
                  {searchQuery ? 'Artists Found' : `Artists from ${activeRegion.name}`}
                </h2>
                <div className="artist-grid">
                  {displayArtists.map((artist) => (
                    <div
                      key={artist.id || artist.name}
                      className="artist-card simple"
                      onClick={() => handleSearch(artist.name.split(' (')[0])}
                    >
                      {!searchQuery && (
                        <button
                          type="button"
                          className="remove-artist-btn"
                          onClick={(event) => {
                            event.stopPropagation()
                            removeArtistShortcut(artist)
                          }}
                          title={`Remove ${artist.name}`}
                        >
                          <X size={16} />
                        </button>
                      )}
                      <Mic2 size={30} className="artist-icon" />
                      <span className="artist-name-label">{artist.name}</span>
                    </div>
                  ))}
                  {!searchQuery && isAddingArtist && (
                    <form
                      className="artist-card simple add-artist-card editing-artist-card"
                      onSubmit={(event) => {
                        event.preventDefault()
                        saveArtistShortcut()
                      }}
                    >
                      <input
                        className="artist-shortcut-input"
                        value={newArtistName}
                        onChange={(event) => setNewArtistName(event.target.value)}
                        autoFocus
                        placeholder="Artist name"
                      />
                      <div className="artist-shortcut-actions">
                        <button type="submit" className="artist-shortcut-save">
                          Add
                        </button>
                        <button
                          type="button"
                          className="artist-shortcut-cancel"
                          onClick={cancelArtistShortcut}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                  {!searchQuery && !isAddingArtist && (
                    <button
                      type="button"
                      className="artist-card simple add-artist-card"
                      onClick={() => setIsAddingArtist(true)}
                    >
                      <Plus size={32} className="artist-icon" />
                      <span className="artist-name-label">Add artist</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {displayTracks.length > 0 && (
              <>
                <h2 className="section-title">Songs Found</h2>
                <div className="track-list">
                  {displayTracks.map((track, index: number) => (
                    <div key={`${track.name}-${track.artist.name}-${index}`} className="track-item">
                      <div className="track-info">
                        {track.artwork ? (
                          <img src={track.artwork} alt={track.name} className="track-art" />
                        ) : (
                          <Music size={28} className="track-icon" />
                        )}
                        <div className="track-details">
                          <span className="track-name">{track.name}</span>
                          <span className="track-artist">{track.artist.name}</span>
                        </div>
                      </div>
                      <button className="ktv-btn-play" onClick={() => playSong(track)}>
                        Play
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {!loading && displayArtists.length === 0 && displayTracks.length === 0 && (
              <div className="loading-state">No results found. Try a different search.</div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default Discovery
