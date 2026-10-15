import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowedShellOrigins, detectEmbed, ShellClient, surfaceStartHash, type ShellClientHandlers } from './embed.ts'

const SHELL = 'https://localhost:5180'

test('tillåtna skal: variabeln plus det lokala skalet i utveckling', () => {
  assert.deepEqual(allowedShellOrigins(undefined, false), [])
  assert.deepEqual(allowedShellOrigins(' https://app.ungap.net , ', false), ['https://app.ungap.net'])
  assert.deepEqual(allowedShellOrigins('', true), [SHELL])
})

test('inbäddad bara när sidan är inramad och skalet är tillåtet', () => {
  const search = `?surface=projects&shell=${encodeURIComponent(SHELL)}`
  assert.deepEqual(detectEmbed(search, true, [SHELL]), { shellOrigin: SHELL, surface: 'projects' })
  assert.equal(detectEmbed(search, false, [SHELL]), null)
  assert.equal(detectEmbed(search, true, []), null)
  assert.equal(detectEmbed('?surface=projects&shell=https://evil.example', true, [SHELL]), null)
  assert.equal(detectEmbed('?surface=projects', true, [SHELL]), null)
})

test('ytan väljer startvy men behåller en djuplänk i samma vy', () => {
  assert.equal(surfaceStartHash('projects', ''), '#/projects')
  assert.equal(surfaceStartHash('jobs', '#/projects'), '#/jobs')
  assert.equal(surfaceStartHash('projects', '#/projects/p1/editor'), null)
  assert.equal(surfaceStartHash('status', ''), null)
})

class FakeShell {
  sent: { message: any; targetOrigin: string }[] = []
  postMessage(message: unknown, targetOrigin: string) {
    this.sent.push({ message, targetOrigin })
  }
}

function setup() {
  const shell = new FakeShell()
  const calls: string[] = []
  let finishLogout: () => void = () => {}
  const handlers: ShellClientHandlers = {
    onInit: (payload) => calls.push(`init:${payload.locale}:${payload.theme}:${payload.layout}`),
    onLocale: (locale) => calls.push(`locale:${locale}`),
    onTheme: (theme) => calls.push(`theme:${theme}`),
    onSurface: (surface) => calls.push(`surface:${surface}`),
    onLogout: () => new Promise<void>((resolve) => { calls.push('logout'); finishLogout = resolve }),
  }
  const client = new ShellClient(shell, { shellOrigin: SHELL, surface: 'projects' }, handlers)
  const receive = (data: unknown, origin = SHELL, source: unknown = shell) => client.handleMessage({ origin, source, data })
  return { shell, client, calls, receive, finishLogout: () => finishLogout() }
}

const init = (replyTo: string, version = 1) => ({
  protocol: 'ungap-shell',
  type: 'init',
  replyTo,
  payload: { version, surface: 'projects', layout: 'single', locale: 'en', theme: 'light' },
})

test('ready skickas bara till skalets origin, och init kopplar upp', () => {
  const { shell, client, calls, receive } = setup()
  client.ready()
  const ready = shell.sent[0]
  assert.equal(ready.targetOrigin, SHELL)
  assert.equal(ready.message.type, 'ready')
  assert.deepEqual(ready.message.payload, { versions: [1], surface: 'projects' })
  receive(init(ready.message.id))
  assert.equal(client.isConnected, true)
  assert.deepEqual(calls, ['init:en:light:single'])
})

test('init med fel id, okänd version, fel origin eller fel fönster ignoreras', () => {
  const { shell, client, calls, receive } = setup()
  client.ready()
  const id = shell.sent[0].message.id
  receive(init('other'))
  receive(init(id, 2))
  receive(init(id), 'https://evil.example')
  receive(init(id), SHELL, new FakeShell())
  assert.equal(client.isConnected, false)
  assert.deepEqual(calls, [])
})

test('språk, tema och utloggning tas bara emot efter handskakningen', () => {
  const { shell, client, calls, receive } = setup()
  client.ready()
  receive({ protocol: 'ungap-shell', type: 'setLocale', payload: { locale: 'sv' } })
  assert.deepEqual(calls, [])
  receive(init(shell.sent[0].message.id))
  receive({ protocol: 'ungap-shell', type: 'setLocale', payload: { locale: 'sv' } })
  receive({ protocol: 'ungap-shell', type: 'setTheme', payload: { theme: 'auto' } })
  receive({ protocol: 'ungap-shell', type: 'setSurface', payload: { surface: 'status', layout: 'combined' } })
  receive({ protocol: 'ungap-shell', type: 'navigate', payload: { to: 'x' } })
  assert.deepEqual(calls, ['init:en:light:single', 'locale:sv', 'theme:auto', 'surface:status'])
})

test('logout besvaras med loggedOut först när sessionen avslutats', async () => {
  const { shell, client, calls, receive, finishLogout } = setup()
  client.ready()
  receive(init(shell.sent[0].message.id))
  receive({ protocol: 'ungap-shell', type: 'logout', id: 'L1' })
  assert.equal(calls.at(-1), 'logout')
  await Promise.resolve()
  assert.equal(shell.sent.length, 1)
  finishLogout()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(shell.sent[1], { targetOrigin: SHELL, message: { protocol: 'ungap-shell', type: 'loggedOut', replyTo: 'L1' } })
})
