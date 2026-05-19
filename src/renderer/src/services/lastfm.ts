import axios from 'axios';

const API_KEY = 'YOUR_LASTFM_API_KEY'; // User will need to provide this or I'll use a placeholder
const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

export const fetchTopTracks = async (country: string) => {
  const response = await axios.get(BASE_URL, {
    params: {
      method: 'geo.gettoptracks',
      country,
      api_key: API_KEY,
      format: 'json',
      limit: 20
    }
  });
  return response.data.tracks.track;
};

export const searchArtists = async (artist: string) => {
  const response = await axios.get(BASE_URL, {
    params: {
      method: 'artist.search',
      artist,
      api_key: API_KEY,
      format: 'json',
      limit: 10
    }
  });
  return response.data.results.artistmatches.artist;
};

export const fetchArtistTopTracks = async (artist: string) => {
  const response = await axios.get(BASE_URL, {
    params: {
      method: 'artist.gettoptracks',
      artist,
      api_key: API_KEY,
      format: 'json',
      limit: 20
    }
  });
  return response.data.toptracks.track;
};
