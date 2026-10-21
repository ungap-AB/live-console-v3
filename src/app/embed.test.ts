import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowedShellOrigins, detectEmbed, relayReturnTo, ShellClient, surfaceStartHash, type ShellClientHandlers } from './embed.ts'

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
  // ungap Presenter spike B1: the playout surface opens one project's playout; Broadcasts leaves it.
  assert.equal(surfaceStartHash('playout', '#/projects', 'p1'), '#/projects/p1/playout')
  assert.equal(surfaceStartHash('playout', '#/projects/p1/playout', 'p1'), null)
  assert.equal(surfaceStartHash('projects', '#/projects/p1/playout'), '#/projects')
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
    onSurface: (surface, id) => calls.push(id ? `surface:${surface}:${id}` : `surface:${surface}`),
    onLogout: () => new Promise<void>((resolve) => { calls.push('logout'); finishLogout = resolve }),
    onMeetingContext: (meeting) => calls.push(`meeting:${meeting ? `${meeting.id}:${meeting.title}` : 'none'}`),
    onSession: (personId, organisationId) => calls.push(`session:${personId}:${organisationId}`),
    onOrgChanged: (organisationId) => calls.push(`org:${organisationId}`),
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

// UNG-332 / flows-and-views.md: navigation through the shell, and the project's meeting for the combined view.
test('navigate and projectMeeting are sent only once connected, and meetingContext only after the handshake', () => {
  const { shell, client, calls, receive } = setup()
  client.ready()
  client.navigate('projects', 'p1')
  receive({ protocol: 'ungap-shell', type: 'meetingContext', payload: { meeting: { id: 'm-0', title: 'X' } } })
  receive(init(shell.sent[0].message.id))
  client.navigate('projects', 'p1')
  client.projectMeeting('m-1')
  receive({ protocol: 'ungap-shell', type: 'meetingContext', payload: { meeting: { id: 'm-1', title: 'KF' } } })
  receive({ protocol: 'ungap-shell', type: 'meetingContext', payload: { meeting: null } })
  assert.deepEqual(shell.sent.slice(1).map((s) => [s.targetOrigin, s.message.type, s.message.payload]), [
    [SHELL, 'navigate', { destination: 'projects', id: 'p1' }],
    [SHELL, 'projectMeeting', { meetingId: 'm-1' }],
  ])
  assert.deepEqual(calls, ['init:en:light:single', 'meeting:m-1:KF', 'meeting:none'])
})

test('setSurface carries the object in the shell address', () => {
  const { shell, client, calls, receive } = setup()
  client.ready()
  receive(init(shell.sent[0].message.id))
  receive({ protocol: 'ungap-shell', type: 'setSurface', payload: { surface: 'status', layout: 'combined', id: 'p1' } })
  receive({ protocol: 'ungap-shell', type: 'setSurface', payload: { surface: 'projects', layout: 'single' } })
  assert.deepEqual(calls.slice(1), ['surface:status:p1', 'surface:projects'])
})

// Step A6: the login relay returns only to an allowed shell, and the shell's login reaches the console.
test('the relay returns only to an allowed shell origin', () => {
  assert.equal(relayReturnTo('https://localhost:5180/#/broadcasts', [SHELL]), 'https://localhost:5180/#/broadcasts')
  assert.equal(relayReturnTo('https://evil.example/', [SHELL]), null)
  assert.equal(relayReturnTo('https://localhost:5180.evil.example/', [SHELL]), null)
  assert.equal(relayReturnTo('javascript:alert(1)', [SHELL]), null)
  assert.equal(relayReturnTo('//localhost:5180/', [SHELL]), null)
  assert.equal(relayReturnTo(null, [SHELL]), null)
})

test('session and orgChanged after the handshake; loginRequired only once connected', () => {
  const { shell, client, calls, receive } = setup()
  client.loginRequired()
  client.ready()
  receive({ protocol: 'ungap-shell', type: 'session', payload: { personId: 'p1', organisationId: 'd1' } })
  receive(init(shell.sent[0].message.id))
  receive({ protocol: 'ungap-shell', type: 'session', payload: { personId: 'p1', organisationId: 'd1' } })
  receive({ protocol: 'ungap-shell', type: 'orgChanged', payload: { organisationId: 'd2' } }, 'https://evil.example')
  receive({ protocol: 'ungap-shell', type: 'orgChanged', payload: { organisationId: 'd2' } })
  assert.deepEqual(calls.filter((c) => c.startsWith('session') || c.startsWith('org')), ['session:p1:d1', 'org:d2'])
  assert.equal(shell.sent.filter((m) => m.message.type === 'loginRequired').length, 0)
  client.loginRequired()
  assert.deepEqual(shell.sent.filter((m) => m.message.type === 'loginRequired').map((m) => m.targetOrigin), [SHELL])
})
