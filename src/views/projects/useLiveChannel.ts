import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Channel, ChannelHealth } from '../../data/types'
import { ApiError } from '../../data/http/fetchJson'

const HEALTH_POLL_MS = 5000

// Delad av ProjectDetail/Playout. Det här ÄR den klientdrivna pollningen
// live-server-v3s fasmaskin bygger på (se steg 1.2) — utan att den här
// hooken är monterad någonstans händer aldrig fasövergångarna, precis som
// gamla systemets konsol drev sin motsvarande pollning.
export function useLiveChannel(
  channelId: string | null,
): {
  channel: Channel | null
  health: ChannelHealth | null
  streamKey: string | null
  refresh: () => Promise<void>
  stopPolling: () => void
} {
  const [channel, setChannel] = useState<Channel | null>(null)
  const [health, setHealth] = useState<ChannelHealth | null>(null)
  // Det RIKTIGA, omaskerade nyckelvärdet — channel.streamKeyMasked är bara för
  // visning. Hämtas separat (egen endpoint) så att den vanliga kanal-hämtningen
  // aldrig behöver skicka en okrypterad nyckel den inte bad om.
  const [streamKey, setStreamKey] = useState<string | null>(null)
  const pollingStopped = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelIdRef = useRef(channelId)
  channelIdRef.current = channelId

  // Kanalens identitet/ingest-data ändras inte under en session — hämtas en
  // gång per id, inte i pollningsloopen.
  useEffect(() => {
    setChannel(null)
    setStreamKey(null)
    if (!channelId) return
    let cancelled = false
    client.channels.get(channelId).then((c) => {
      if (!cancelled) setChannel(c ?? null)
    })
    client.channels.getStreamKey(channelId).then((key) => {
      if (!cancelled) setStreamKey(key)
    })
    return () => {
      cancelled = true
    }
  }, [channelId])

  useEffect(() => {
    setHealth(null)
    pollingStopped.current = false
    if (!channelId) return
    let cancelled = false
    const poll = () => {
      if (pollingStopped.current) return
      client.channels.health(channelId!).then((h) => {
        if (!cancelled) setHealth(h)
      }).catch((err) => {
        if (!cancelled && err instanceof ApiError && err.code === 'channel_not_found') {
          pollingStopped.current = true
          setChannel(null)
          setHealth(null)
          setStreamKey(null)
          if (intervalRef.current) clearInterval(intervalRef.current)
        }
      })
    }
    poll()
    const id = setInterval(poll, HEALTH_POLL_MS)
    intervalRef.current = id
    return () => {
      cancelled = true
      clearInterval(id)
      intervalRef.current = null
    }
  }, [channelId])

  const stopPolling = useCallback(() => {
    pollingStopped.current = true
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Låter en debug-/livscykelåtgärd (starta/stoppa enkoder, riv resurs) hämta
  // det nya tillståndet direkt istället för att vänta på nästa pollning —
  // annars kan UI:t verka "inte reagera" i upp till HEALTH_POLL_MS efter klick.
  const refresh = useCallback(async () => {
    const id = channelIdRef.current
    if (!id) return
    // channels.health() throws on 404 (unlike get()) — hämta kanalen först så
    // en nyss riven resurs inte orsakar ett ohanterat fel här.
    const c = await client.channels.get(id)
    setChannel(c ?? null)
    if (!c) {
      setHealth(null)
      setStreamKey(null)
      return
    }
    setHealth(await client.channels.health(id))
    setStreamKey(await client.channels.getStreamKey(id))
  }, [])

  return { channel, health, streamKey, refresh, stopPolling }
}
