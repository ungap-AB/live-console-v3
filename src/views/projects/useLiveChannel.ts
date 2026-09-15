import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Channel, ChannelHealth } from '../../data/types'

const HEALTH_POLL_MS = 5000

// Delad av ProjectDetail/Playout. Det här ÄR den klientdrivna pollningen
// live-server-v3s fasmaskin bygger på (se steg 1.2) — utan att den här
// hooken är monterad någonstans händer aldrig fasövergångarna, precis som
// gamla systemets konsol drev sin motsvarande pollning.
export function useLiveChannel(channelId: string | null): { channel: Channel | null; health: ChannelHealth | null } {
  const [channel, setChannel] = useState<Channel | null>(null)
  const [health, setHealth] = useState<ChannelHealth | null>(null)

  // Kanalens identitet/ingest-data ändras inte under en session — hämtas en
  // gång per id, inte i pollningsloopen.
  useEffect(() => {
    setChannel(null)
    if (!channelId) return
    let cancelled = false
    client.channels.get(channelId).then((c) => {
      if (!cancelled) setChannel(c ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [channelId])

  useEffect(() => {
    setHealth(null)
    if (!channelId) return
    let cancelled = false
    const poll = () => {
      client.channels.health(channelId!).then((h) => {
        if (!cancelled) setHealth(h)
      })
    }
    poll()
    const id = setInterval(poll, HEALTH_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [channelId])

  return { channel, health }
}
