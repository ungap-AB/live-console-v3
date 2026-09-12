# API – endpoints för Ungap Live

Härledd från vyerna i handover-dokumentet. Listan är vad gränssnittet behöver, inte en beskrivning av det befintliga API:et — stäm av mot det som redan finns och justera.

**Konventioner som antas genomgående**

- Bas: `/api/v1`
- JSON in och ut, `application/json`
- Tider i ISO 8601 med UTC (`2026-09-12T13:02:11Z`)
- Id:n som ogenomskinliga strängar
- Listor paginerade med `?page=&pageSize=`, svar `{ items, page, pageSize, total }`
- Optimistisk samtidighet med `ETag` + `If-Match` på resurser som flera kan redigera (mallar)
- Fel som `{ error: { code, message, details? } }` med maskinläsbar `code`

---

## 1. Autentisering och session

| Metod | Path | Syfte |
|---|---|---|
| `GET` | `/auth/me` | Inloggad användare, roller, domän. Driver shell och rollspärrar. |
| `POST` | `/auth/logout` | Avsluta session. |
| `POST` | `/auth/password-reset` | Skicka återställningslänk till angiven e-post. |

`GET /auth/me` →

```json
{
  "id": "u1",
  "name": "Anders Mårtén",
  "email": "anders.marten@kalmar.se",
  "domain": { "id": "d1", "host": "kalmar.se", "org": "Kalmar kommun" },
  "roles": ["admin", "operator"]
}
```

---

## 2. Dagordningar

| Metod | Path | Syfte |
|---|---|---|
| `GET` | `/agendas` | Lista. `?q=` för sök. |
| `POST` | `/agendas` | Skapa. |
| `GET` | `/agendas/{id}` | Hämta med punkter. |
| `PATCH` | `/agendas/{id}` | Namn, beskrivning. |
| `DELETE` | `/agendas/{id}` | Till papperskorgen (mjuk). |
| `POST` | `/agendas/{id}/duplicate` | Kopia utan projektkopplingar. |
| `PUT` | `/agendas/{id}/items` | Ersätt hela punktlistan — enklast vid omsortering. |
| `POST` | `/agendas/{id}/items` | Lägg till punkt. |
| `PATCH` | `/agendas/{id}/items/{itemId}` | Rubrik, ärendenummer. |
| `DELETE` | `/agendas/{id}/items/{itemId}` | Ta bort punkt. |

Listposten behöver `itemCount`, `changedAt` och `usedInProjects` (antal) för att listan ska kunna ritas utan extra anrop.

```json
{
  "id": "d1",
  "name": "Kommunfullmäktige – standard",
  "description": "Ordinarie sammanträde",
  "itemCount": 8,
  "usedInProjects": 4,
  "changedAt": "2026-09-08T09:14:00Z",
  "items": [
    { "id": "i1", "position": 1, "title": "Mötet öppnas" },
    { "id": "i5", "position": 5, "title": "Årsredovisning 2025", "reference": "KS 2026/184" }
  ]
}
```

> Omsortering via `PUT …/items` med hela listan är enklare än en separat `reorder`-endpoint och undviker positionskonflikter.

---

## 3. Namnlistor

| Metod | Path | Syfte |
|---|---|---|
| `GET` | `/namelists` | Lista. `?q=` |
| `POST` | `/namelists` | Skapa. |
| `GET` | `/namelists/{id}` | Hämta med namn. |
| `PATCH` | `/namelists/{id}` | Namn, beskrivning. |
| `DELETE` | `/namelists/{id}` | Till papperskorgen. |
| `POST` | `/namelists/{id}/duplicate` | Kopia. |
| `PUT` | `/namelists/{id}/people` | Ersätt hela listan (omsortering, A–Ö-sortering). |
| `POST` | `/namelists/{id}/people` | Lägg till namn. |
| `PATCH` | `/namelists/{id}/people/{personId}` | Ändra namn. |
| `DELETE` | `/namelists/{id}/people/{personId}` | Ta bort namn. |

Personobjektet är `{ id, position, name }`. Fälten `party` och `role` tillkommer senare — lägg dem i modellen nu även om de inte exponeras i UI.

---

## 4. Projekt

| Metod | Path | Syfte |
|---|---|---|
| `GET` | `/projects` | Lista. `?q=&state=` |
| `POST` | `/projects` | Skapa. |
| `GET` | `/projects/{id}` | Fullt projekt med alla fyra tillståndsdimensioner. |
| `PATCH` | `/projects/{id}` | Namn, beskrivning, planerad tid. |
| `DELETE` | `/projects/{id}` | Till papperskorgen. |
| `PUT` | `/projects/{id}/visibility` | `{ "visibility": "open" \| "closed" }` |
| `PUT` | `/projects/{id}/agenda` | Koppla dagordning: `{ "agendaId": "d1" }`. `null` kopplar loss. |
| `PUT` | `/projects/{id}/namelist` | Koppla namnlista. |

```json
{
  "id": "p1",
  "name": "Kommunfullmäktige 24 september",
  "visibility": "open",
  "playerUrl": "https://play.ungap.se/p/kf-2409",
  "channel": { "id": "c1", "state": "live" },
  "recording": { "id": "r1", "state": "recording" },
  "publication": { "state": "none" },
  "agendaId": "d1",
  "namelistId": "n1"
}
```

`recording.state`: `none | recording | recorded | trimmed | published`
`publication.state`: `none | review | published`

---

## 5. Playout och tidslinje

Hjärtat i dokumentationen under sändning.

| Metod | Path | Syfte |
|---|---|---|
| `GET` | `/projects/{id}/playout` | Aktuellt ärende, aktuell talare, hela tidslinjen. |
| `POST` | `/projects/{id}/playout/cue` | Spela ut ett element. |
| `GET` | `/projects/{id}/timeline` | Tidslinjen separat (för polling). |
| `PATCH` | `/projects/{id}/timeline/{eventId}` | Rätta en felaktig markering. |
| `DELETE` | `/projects/{id}/timeline/{eventId}` | Ta bort en felaktig markering. |

`POST …/playout/cue` →

```json
{ "kind": "agendaItem", "refId": "i5" }
```

eller `{ "kind": "person", "refId": "pe3" }`

Svar:

```json
{
  "eventId": "ev12",
  "kind": "agendaItem",
  "refId": "i5",
  "label": "5. Årsredovisning 2025",
  "occurredAt": "2026-09-24T13:19:44Z",
  "offsetSeconds": 908
}
```

**Krav på servern:**

- Anropet skickar timed metadata till IVS **och** skriver tidslinjeposten. Båda eller ingen.
- `occurredAt` i UTC är källdata. `offsetSeconds` är beräknat mot inspelningens start och får vara `null` om inspelning inte pågår.
- Samma `refId` flera gånger ger flera händelser. Ingen deduplicering.
- Avvisa med `409` om projektet är publicerat eller ingen sändning pågår.

---

## 6. Live-resurser (IVS-kanaler)

| Metod | Path | Syfte |
|---|---|---|
| `GET` | `/channels` | Lista alla allokerade kanaler. |
| `GET` | `/channels/quota` | `{ "used": 5, "limit": 20 }` för kvotmätaren. |
| `POST` | `/channels` | Skapa. `{ "name", "projectId"?, "type", "latencyMode", "recording" }` |
| `GET` | `/channels/{id}` | Detaljer inklusive ingest, stream key, playback-URL, ARN. |
| `DELETE` | `/channels/{id}` | Riv. Ska returnera `409` om stream är aktiv. |
| `POST` | `/channels/{id}/rotate-key` | Ny stream key; den gamla slutar gälla omedelbart. |
| `PUT` | `/channels/{id}/project` | Koppla till projekt, eller `null` för fristående. |
| `GET` | `/channels/{id}/health` | Signalhälsa. **Pollas var 3–5 s när vyn är öppen.** |

```json
{
  "id": "c1",
  "name": "kf-2409",
  "state": "live",
  "region": "eu-north-1",
  "type": "STANDARD",
  "latencyMode": "LOW",
  "recording": true,
  "arn": "arn:aws:ivs:eu-north-1:…:channel/a1B2c3D4e5F6",
  "ingestEndpoint": "rtmps://a1b2c3.global-contribute.live-video.net:443/app/",
  "playbackUrl": "https://a1b2c3.eu-north-1.playback.live-video.net/…/master.m3u8",
  "projectId": "p1",
  "createdAt": "2026-09-12T08:41:00Z",
  "lastUsedAt": "2026-09-24T13:02:11Z",
  "idleDays": 0
}
```

`GET …/health` →

```json
{
  "state": "live",
  "bitrateKbps": 5980,
  "resolution": "1920x1080",
  "framerate": 50,
  "lastFrameSecondsAgo": 0.4,
  "streamStartedAt": "2026-09-24T13:02:11Z"
}
```

**Två saker som får konsekvenser om de görs fel:**

- Stream key returneras maskerad i listan och i klartext bara på uttrycklig begäran (`GET /channels/{id}/stream-key`), så den inte ligger i varje listsvar.
- Misslyckad rivning mot IVS får **inte** markera kanalen som riven lokalt. Returnera fel och behåll posten.

---

## 7. Inspelningar och videoarkiv

| Metod | Path | Syfte |
|---|---|---|
| `GET` | `/recordings` | Lista original med `children` för trimmade versioner. `?q=` |
| `GET` | `/recordings/{id}` | Detaljer. |
| `DELETE` | `/recordings/{id}` | Till papperskorgen. Original tar med sina trimmade versioner. |
| `GET` | `/recordings/{id}/download` | Nedladdningslänk (signerad URL, kort giltighet). |
| `GET` | `/recordings/{id}/chapters` | Kapitelmärken för originalet. |
| `POST` | `/recordings/upload` | Initiera uppladdning → signerad URL + `recordingId`. |
| `POST` | `/recordings/{id}/upload-complete` | Bekräfta uppladdning, starta analys. |

```json
{
  "id": "r1",
  "kind": "original",
  "name": "Kommunfullmäktige 27 aug 2026",
  "projectId": "p1",
  "source": "ivs",
  "startedAt": "2026-08-27T13:02:00Z",
  "durationSeconds": 6427,
  "sizeBytes": 9269248000,
  "resolution": "1920x1080",
  "framerate": 50,
  "hlsUrl": "https://cdn.ungap.se/rec/kf-2708/original/master.m3u8",
  "segments": [
    { "startedAt": "2026-08-27T13:02:00Z", "durationSeconds": 3200 },
    { "startedAt": "2026-08-27T13:58:20Z", "durationSeconds": 3227 }
  ],
  "children": ["r1t"]
}
```

> **`segments` är viktig.** Ett glapp betyder att UTC→offset inte är en subtraktion utan en summering av segmentlängder. Låt API:et exponera segmenten hellre än att varje klient gissar.

---

## 8. Trimning och publicering

| Metod | Path | Syfte |
|---|---|---|
| `POST` | `/recordings/{id}/trim` | Skapa eller uppdatera trimmad version. |
| `GET` | `/trim-jobs/{jobId}` | Jobbstatus. **Pollas tills `done`.** |
| `POST` | `/projects/{id}/review-link` | Skapa granskningslänk. |
| `DELETE` | `/projects/{id}/review-link` | Återkalla. |
| `POST` | `/projects/{id}/publish` | Publicera ondemand. Fryser kapitellistan. |
| `POST` | `/projects/{id}/unpublish` | Avpublicera. |
| `GET` | `/projects/{id}/chapters` | Publicerad kapitellista med offset. |

`POST …/trim` →

```json
{ "startOffsetSeconds": 120, "endOffsetSeconds": 6100 }
```

Svar: `{ "jobId": "j9", "state": "processing" }`

`GET /trim-jobs/j9` → `{ "state": "done", "recordingId": "r1t" }`
Vid fel: `{ "state": "failed", "error": { "code": "…", "message": "…" } }`

`POST …/review-link` →

```json
{
  "url": "https://play.ungap.se/review/9f3a-kf2409",
  "token": "9f3a…",
  "expiresAt": "2026-10-01T00:00:00Z"
}
```

Granskningslänken ska visa **exakt** det publiken kommer att se — trimmad video plus kapitellista — annars fyller granskningen ingen funktion.

`POST …/publish` fryser tidslinjen till en kapitellista. Efter det påverkar ändringar i dagordningsmallen inte publicerat material.

`GET …/chapters` →

```json
{
  "frozen": true,
  "chapters": [
    { "kind": "agendaItem", "label": "1. Mötet öppnas", "offsetSeconds": 0 },
    { "kind": "person", "label": "Clara Mårtén", "offsetSeconds": 885 }
  ]
}
```

---

## 9. Papperskorg

| Metod | Path | Syfte |
|---|---|---|
| `GET` | `/trash` | Alla borttagna objekt oavsett typ. `?type=&q=` |
| `POST` | `/trash/{id}/restore` | Återställ. |
| `DELETE` | `/trash/{id}` | Ta bort permanent. |
| `GET` | `/trash/policy` | `{ "retentionDays": 30 }` |

```json
{
  "id": "t4",
  "type": "recording",
  "refId": "r9",
  "name": "Testsändning 28 aug",
  "detail": "Original · 00:12:40 · 0,9 GB",
  "deletedAt": "2026-08-29T10:00:00Z",
  "deletedBy": { "id": "u1", "name": "Anders Mårtén" },
  "purgeAt": "2026-09-28T10:00:00Z"
}
```

Servern levererar `purgeAt`; klienten räknar ut dagar kvar. Sätt inte perioden i klienten.

---

## 10. Domäner och användare

| Metod | Path | Syfte |
|---|---|---|
| `GET` | `/domains` | Lista med `userCount`. |
| `POST` | `/domains` | Lägg till domän. |
| `PATCH` | `/domains/{id}` | Organisationsnamn, inställningar. |
| `DELETE` | `/domains/{id}` | Ta bort. |
| `GET` | `/domains/{id}/users` | Användare i domänen. `?q=` |
| `POST` | `/domains/{id}/invitations` | Bjud in: `{ "email", "name", "roles" }` |
| `POST` | `/invitations/{id}/resend` | Skicka om. |
| `DELETE` | `/invitations/{id}` | Återkalla. |
| `GET` | `/users/{id}` | Detaljer. |
| `PATCH` | `/users/{id}` | Namn, e-post. |
| `PUT` | `/users/{id}/roles` | `{ "roles": ["operator"] }` |
| `POST` | `/users/{id}/disable` | Inaktivera. |
| `POST` | `/users/{id}/enable` | Aktivera. |
| `DELETE` | `/users/{id}` | Ta bort konto. |
| `GET` | `/users/{id}/activity` | Senaste aktivitet för detaljvyn. |

Roller: `admin`, `operator`, `editor`, `reviewer`. Kombinerbara.

**Serverspärr:** avvisa med `409` varje operation som lämnar en domän utan aktiv administratör — rolländring, inaktivering och borttagning. Klientspärren finns men får inte vara den enda.

---

## 11. Sammanfattning: vad som pollas

| Endpoint | Intervall | När |
|---|---|---|
| `/channels/{id}/health` | 3–5 s | Live-fliken eller playout öppen |
| `/projects/{id}` | 5–10 s | Projektvy öppen, för tillståndsändringar |
| `/trim-jobs/{jobId}` | 2 s | Under pågående trimning |
| `/channels` | vid fokus | Live-resursvyn |

Polling räcker för den här belastningen — livetittarna är få och operatörerna ännu färre. WebSocket eller SSE för kanalstatus är en senare optimering, inte ett krav.

---

## 12. Frågor att stämma av mot befintligt API

1. Vad returnerar IVS recording-metadata om starttid och segment? Modellen i avsnitt 7 förutsätter att glapp går att se.
2. Är trimning synkron eller asynkron? Avsnitt 8 antar asynkron med jobb-id.
3. Hur hanteras auth idag — session cookie eller bearer token?
4. Finns kapitel/timed metadata redan, eller är det nytt?
5. Sker mjuk borttagning per resurstyp idag, eller behövs papperskorgen som ny modell?
6. Finns kvotinformationen tillgänglig, eller måste den räknas fram mot AWS?
