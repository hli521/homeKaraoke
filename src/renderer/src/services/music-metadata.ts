type ItunesArtist = {
  artistId: number
  artistName: string
  artworkUrl60?: string
  artworkUrl100?: string
}

type ItunesTrack = {
  wrapperType?: string
  kind?: string
  trackName?: string
  artistName?: string
  artworkUrl100?: string
  previewUrl?: string
}

export type ArtistResult = {
  name: string
  artistId: number
  artwork: string | null
}

export type TrackResult = {
  name: string
  artist: { name: string }
  artwork?: string
  previewUrl?: string
}

const ORIGINAL_TITLE_OVERRIDES: Record<string, string> = {
  'g e m|only one': '唯一',
  'g e m|only one live': '唯一'
}

const normalizeLookupKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const getOriginalTrackName = (track: ItunesTrack): string => {
  const artistKey = normalizeLookupKey(track.artistName || '')
  const trackKey = normalizeLookupKey(track.trackName || '')
  return ORIGINAL_TITLE_OVERRIDES[`${artistKey}|${trackKey}`] || track.trackName || ''
}

const toTrackResult = (track: ItunesTrack): TrackResult => ({
  name: getOriginalTrackName(track),
  artist: { name: track.artistName || '' },
  artwork: track.artworkUrl100,
  previewUrl: track.previewUrl
})

export const fetchTopTracks = async (countryCode: string): Promise<TrackResult[]> => {
  const results = (await window.api.fetchTopTracks(countryCode)) as ItunesTrack[]
  return results.map((track) => ({
    name: track.trackName || '',
    artist: { name: track.artistName || '' },
    artwork: track.artworkUrl100
  }))
}

export const searchArtists = async (
  term: string,
  country: string = 'us'
): Promise<ArtistResult[]> => {
  const results = (await window.api.searchArtists(term, country)) as ItunesArtist[]
  return results.map((artist) => ({
    name: artist.artistName,
    artistId: artist.artistId,
    artwork: artist.artworkUrl100 || artist.artworkUrl60 || null
  }))
}

export const fetchArtistTopTracks = async (
  artistId: string | number,
  country: string = 'us'
): Promise<TrackResult[]> => {
  const results = (await window.api.fetchArtistTopTracks(artistId, country)) as ItunesTrack[]
  if (!results || results.length === 0) return []

  // iTunes lookup results[0] is usually artist metadata, rest are tracks.
  return results
    .filter((res) => res.wrapperType === 'track' && res.kind === 'song')
    .map(toTrackResult)
}

export const searchTracksByArtistName = async (
  artistName: string,
  country: string = 'us'
): Promise<TrackResult[]> => {
  const cleanedSearchName = artistName.includes(' (') ? artistName.split(' (')[0] : artistName
  const results = (await window.api.searchTracks(cleanedSearchName, country)) as ItunesTrack[]
  const matchTerm = cleanedSearchName.toLowerCase()

  return results
    .filter((res) => {
      const resultArtist = (res.artistName || '').toLowerCase()
      return resultArtist.includes(matchTerm) || matchTerm.includes(resultArtist)
    })
    .map(toTrackResult)
}

export const searchTracks = async (
  term: string,
  country: string = 'us'
): Promise<TrackResult[]> => {
  const results = (await window.api.searchTracks(term, country)) as ItunesTrack[]
  return results.map(toTrackResult)
}

export const getArtistArtwork = async (
  artistId: string | number,
  country: string = 'us'
): Promise<string | null> => {
  const results = (await window.api.fetchArtistTopTracks(artistId, country)) as ItunesTrack[]
  const withArt = results.find((result) => result.artworkUrl100)
  return withArt?.artworkUrl100 || null
}
