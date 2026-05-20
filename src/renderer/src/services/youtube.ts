export type YouTubeAudioMode = 'original' | 'karaoke'

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
