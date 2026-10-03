// Delningslänken i mejlet (UNG-80 steg 4): #/downloads/{token}. Token ligger i fragmentet, som webbläsaren aldrig
// skickar till någon server; sidans egen kod skickar den som POST-kropp till API:t.
export function parseShareToken(hash: string): string | null {
  const [path] = hash.replace(/^#/, '').split('?')
  const [, section, token] = path.split('/')
  if (section !== 'downloads' || !token) return null
  try {
    return decodeURIComponent(token)
  } catch {
    return null
  }
}
