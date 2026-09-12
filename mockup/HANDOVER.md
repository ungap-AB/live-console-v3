# Handover – Ungap Live, operatörsgränssnitt

Underlag för att (1) bygga om mockuparna till en sammanhållen prototyp i Vite/Preact och (2) därefter koppla prototypen mot det befintliga API:et.

Dokumentet beskriver domänmodell, fattade designbeslut och samtliga vyer. Det förutsätter ingen kännedom om de HTML-mockupar som ligger till grund för det, men de är den visuella referensen.

---

## 1. Vad tjänsten gör

Tjänsten hanterar tre steg i samma arbetsflöde:

1. **Live-sändning** av ett formellt möte (kommunfullmäktige, kommunstyrelse, stämma) via AWS IVS.
2. **Dokumentation under sändning** — operatören spelar ut dagordningspunkter och talarnamn, som dels blir grafik i spelaren via timed metadata, dels loggas som kapitelmärken.
3. **Ondemand-publicering** — inspelningen trimmas, granskas och publiceras med en klickbar kapitellista.

Livetittarna är få. Merparten av publiken tittar i efterhand, vilket gör kapitelindelningen till den funktion som skapar mest värde.

---

## 2. Domänmodell

| Begrepp | Beskrivning |
|---|---|
| **Projekt** | Ett möte. Håller ihop live-resurs, playout, inspelning och publicering. |
| **Dagordning** | Mall med ordnade punkter. Skapas fristående, läggs in i projekt. |
| **Dagordningspunkt** | Rubrik + valfritt ärendenummer (t.ex. `KS 2026/184`). |
| **Namnlista** | Mall med personnamn. Skapas fristående, läggs in i projekt. |
| **Live-resurs** | En IVS-kanal med ingest-server, stream key och playback-URL. |
| **Inspelning** | Original från IVS, eller uppladdad fil. Oföränderlig. |
| **Trimmad version** | Barn till en originalinspelning, definierad av start- och slutpunkt. |
| **Tidslinje** | Ordnad lista av utspelningshändelser under sändning. Blir kapitellista. |
| **Kapitel** | En post i tidslinjen: typ (ärende/talare), etikett, tidpunkt. |
| **Granskningslänk** | Tokenbaserad URL som ger åtkomst till en trimmad, opublicerad sändning. |

### Tidslinjen är egen, inte en flagga på dagordningen

Detta är den viktigaste modellpunkten. När operatören spelar ut något skapas en **händelse** i tidslinjen. Samma dagordningspunkt kan spelas ut flera gånger (bordläggning, återupptagen debatt) och ger då flera kapitel. Bocken i playout-vyn är en **vy** över "denna punkt förekommer i tidslinjen", inte lagringen.

Talarnamn ger också kapitel. Tidslinjen innehåller alltså båda typerna.

### Tid

Kapitelmärken lagras som **UTC**. Inspelningen har en starttid i UTC. Den publicerade kapitellistan innehåller **offset mot videons start**, beräknad vid publicering.

Skälet: UTC överlever omtrimning. Ändras trimpunkterna räknas offseten om från källdata i stället för att skrivas om destruktivt.

> **Olöst:** om inspelningen har glapp (enkodern tappade anslutningen och återkom) är UTC→offset inte en enkel subtraktion. Segmentens verkliga längder måste summeras. Behöver verifieras mot vad IVS recording-metadata faktiskt levererar.

### Snapshot vid publicering

Under sändning arbetar projektet mot **originalen** av dagordning och namnlista — ändringar mitt i mötet ska slå igenom. Vid publicering **fryses** tidslinjen till en kapitellista som inte längre är kopplad till mallen. En senare redigering av dagordningsmallen påverkar inte publicerat material.

---

## 3. Tillståndsmodell

Ett projekt har fyra oberoende dimensioner. Att hålla dem åtskilda i modellen förenklar både UI och backend.

| Dimension | Värden |
|---|---|
| **Live-resurs** | `none` → `ready` |
| **Enkoder** | `stopped` ↔ `sending` (växlar fritt, flera gånger per möte) |
| **Inspelning** | `none` → `recording` → `recorded` → `trimmed` → `published` |
| **Synlighet** | `open` ↔ `closed` |

Härledda regler:

- Trimning kräver `inspelning = recorded` och `enkoder = stopped`.
- Publicering kräver `inspelning = trimmed` och är ett **eget steg**, skilt från att spara trimpunkter.
- Riv resurs kräver `enkoder = stopped`. (IVS tillåter `DeleteChannel` under aktiv stream — spärren måste komma från applikationen.)
- Utspelning i playout kräver `enkoder = sending` (timed metadata kan bara skickas i en aktiv ström) och blockeras efter publicering.

**Synlighet styrs manuellt av operatören genom hela förloppet.** Att enkodern slutar sända betyder inte att mötet är slut — det kan vara en störning. Ingen automatik på den signalen.

> **Olöst:** en otrimmad inspelning kan ligga öppen om operatören glömmer stänga efter mötet. Ingen lösning vald.

---

## 4. Fattade designbeslut

| # | Fråga | Beslut |
|---|---|---|
| 1 | Punkt utspelad flera gånger | Flera kapitel. Tidslinjen är en händelselista, ärenden och talare ger båda kapitel. |
| 2 | Publicering | Eget steg. Granskningslänk delas till behöriga före publicering. |
| 3 | Synlighet | Manuell genom hela förloppet. Ingen automatisk stängning. |
| 4 | Tidslagring | UTC i källdata, offset i publicerad kapitellista. |
| 5 | Namnlista | Bara namn i första versionen. Parti/roll och operatörsstöd senare. |
| 6 | Riv resurs | Låst under live, annars tillåtet med tydlig bekräftelse. Housekeeping senare. |
| 7 | Mallar | Dagordningar och namnlistor skapas fristående och läggs in i projekt. |

---

## 5. Vyerna

Gemensamt för alla: vänsterspalt med meny, högerspalt med vyinnehåll. Master–detail där det finns detaljer, enkel lista där det inte gör det.

### 5.1 Shell

Applikationsramen. Vänsterspalt med:

- **Innehåll:** Projekt, Dagordningar, Namnlistor
- **Sändning:** Live, Videoarkiv
- **Administration:** Papperskorg, Användare

Längst ned namn och domän för inloggad användare samt utloggningsknapp. Kollapsar till overlay under 820 px. Navigering sätter hash/route så att varje vy är länkbar.

### 5.2 Projektvy

Två delar: projektöversikt och playout.

**Projektöversikt** — spelarlänk, synlighetsväljare, och flikarna Live / Ondemand.

*Live-fliken:* statusindikator (Ingen resurs / Offline / Sänder) åtskild från åtgärdsknapparna (Skapa ingest, Riv resurs). Ingest-server, stream key och HLS-URL med kopiera. Signalhälsa: bitrate, upplösning, tid sedan senaste bild, inspelad tid.

*Ondemand-fliken:* Trimma inspelning → Skapa granskningslänk → Publicera, där varje steg låses upp av det föregående. Varning om inspelningen har glapp.

**Playout** — styr spelarens grafik och dokumenterar mötet. Tre kolumner:

1. Dagordning: play-knapp per punkt, blir bock med tidsstämpel när utspelad, klickbar igen för att spela ut på nytt. Dra-och-släpp för sortering.
2. Namnlista: play-knapp per namn, blir aldrig bock.
3. Tidslinje: varje utspelning loggas med offset. Fryses vid publicering.

Överst visas aktuellt ärende och aktuell talare.

### 5.3 Dagordningar

Master–detail. Listan har sök och Ny, visar antal punkter, ändringsdatum och en markering för mallar som används i projekt.

Detaljvyn: namn, beskrivning, antal punkter, användningsmärkning. Åtgärder: Byt namn, Duplicera, Flytta till papperskorgen. Punkterna med dra-och-släpp, inline-redigering (rubrik + ärendenummer), lägg till och ta bort.

Vid användning i projekt visas upplysningen om att ändringar slår igenom i opublicerade projekt men inte i publicerade.

### 5.4 Namnlistor

Samma mönster som dagordningar, med tre skillnader:

- Namnen är **onumrerade** — ordningen spelar roll för scanning men är ingen sekvens.
- **Filter inne i listan** (ett fullmäktige har 60–80 ledamöter). När filtret är aktivt döljs draghandtagen, eftersom omsortering av en delmängd är odefinierad.
- **Sortera A–Ö** som knapp.

Endast namnfältet. Parti/roll blir en kolumn till när det införs.

### 5.5 Live-resurser

Överblick över allokerade IVS-kanaler, med eller utan kopplat projekt. Resurser skapas normalt inifrån ett projekt men kan skapas fristående.

Överst i listan en **kvotmätare**: antal allokerade kanaler mot kontots tak, uppdelat på sändande, vilande och lediga. Det är vyns huvudsakliga existensberättigande — kanaltaket, inte kostnaden, är begränsningen.

Listan sorterar sändande först, därefter efter hur länge resursen legat oanvänd. Städkandidater hamnar sist och markeras.

Detaljvyn: anslutningsuppgifter (ingest, stream key, playback-URL, ARN) med kopiera, projektkoppling eller möjlighet att koppla, signalhälsa när den sänder. Åtgärder: Rotera stream key (varnar under sändning), Riv resurs (låst under sändning), Koppla till projekt.

Ny resurs nekas när taket är nått, med uppmaning att riva en vilande först.

### 5.6 Videoarkiv

Listan visar originalinspelningar med trimmade versioner indragna under, kopplade visuellt. Sökning träffar hela gruppen. Ladda upp-knapp i listhuvudet — uppladdade filer blir originalinspelningar utan projektkoppling.

Detaljvyn: längd, upplösning, storlek, antal kapitel, HLS-länk med kopiera, projektgenväg (eller besked om att koppling saknas), Ladda ner. För original även **Trimma**.

**Trimdialogen** visar hela inspelningen som en stapel med kapitelmärkena utritade. Två handtag plus tidfält sätter start och slut. Kapitel utanför klippet gråas och räknas upp. Sparar man skapas eller uppdateras den trimmade versionen, och kapitlens offset räknas om mot den nya startpunkten.

Original kan inte publiceras direkt — bara trimmas.

> **Olöst:** ska ett möte som inte behöver klippas kunna publiceras utan trimsteg?

### 5.7 Papperskorg

Enkel lista, ingen detaljvy. Hit går projekt, dagordningar, namnlistor och inspelningar.

Varje rad: ikon och typmärkning, typspecifik detalj (antal punkter / antal namn / längd och storlek), vem som tog bort och när, tid kvar före rensning, Återställ-knapp.

Sorteringen är efter **tid kvar**, inte borttagningsdatum — det brådskande hamnar överst. Under sju dagar ger varningsfärg, under två dagar rött. Återställ visar en toast med Ångra i stället för bekräftelsedialog.

Retentionsperioden bör vara konfigurerbar per organisation; kommuner har olika gallringsregler.

> **Inte byggt:** permanent borttagning och Töm papperskorgen. För inspelningar är det den enda oåterkalleliga handlingen i systemet och behöver starkare bekräftelse än resten.

### 5.8 Användare

Tre kolumner: domäner → användare i domänen → detaljer.

Fyra kombinerbara roller:

| Roll | Får |
|---|---|
| Administratör | Hantera användare, domäner och live-resurser |
| Operatör | Skapa projekt, sända, publicera |
| Redaktör | Hantera mallar och videoarkiv, men inte sända |
| Granskare | Enbart öppna granskningslänkar och godkänna |

Statusar: aktiv, inbjuden, inaktiverad. Inaktiverade konton behålls så att historiken pekar på en riktig användare.

**Spärr:** sista aktiva administratören på en domän kan varken inaktiveras, tas bort eller mista admin-rollen.

Inga lösenordsfält — bara utskick av återställningslänk. Exemplen loggar in via SSO; lokala konton kräver mer i den här vyn.

---

## 6. Steg 1 – mockup i Vite/Preact

Målet är en klickbar prototyp som beter sig som den färdiga produkten men matas av påhittad data. **Allt arbete ska riktas mot att steg 2 blir ett byte av dataadapter, inte en omskrivning.**

### 6.1 Projektstruktur

```
src/
  main.tsx                 # mount, router
  app/
    Shell.tsx              # vänsterspalt + routing-outlet
    routes.ts
  views/
    projects/              # ProjectList, ProjectDetail, Playout
    agendas/
    namelists/
    live/
    archive/
    trash/
    users/
  components/              # SplitPane, StatusChip, CopyField, DataTable,
                           # SortableList, Modal, Toast, QuotaBar
  data/
    types.ts               # domäntyper, delade mellan mock och API
    client.ts              # ← den enda filen steg 2 rör
    mock/                  # fixtures + fördröjningar
  styles/
    tokens.css             # designvariabler
```

### 6.2 Tekniska val

- **Preact + preact/hooks**, `preact-iso` för routing (liten, räcker).
- **TypeScript.** Domäntyperna är det som håller ihop mockup och API.
- **CSS-variabler**, ingen CSS-in-JS. Tokens finns redan i mockuparna (`--ink`, `--line`, `--live`, `--odm` m.fl.) och kan lyftas rakt av.
- **Ingen global state-hanterare till att börja med.** Vyerna är i huvudsak oberoende; `useState` plus en enkel `useResource`-hook räcker. Inför signals först när det behövs.
- **Inget komponentbibliotek.** Mockuparna definierar redan formspråket, och ett bibliotek skulle behöva överstyras.

### 6.3 Dataåtkomst – nyckeln till steg 2

All datahämtning går genom ett tunt gränssnitt i `data/client.ts`:

```ts
export interface Client {
  agendas: {
    list(): Promise<Agenda[]>;
    get(id: string): Promise<Agenda>;
    create(input: AgendaInput): Promise<Agenda>;
    update(id: string, input: AgendaInput): Promise<Agenda>;
    trash(id: string): Promise<void>;
  };
  // …samma mönster för namelists, projects, channels, recordings, trash, users
}
```

Mockupen exporterar en implementation som läser fixtures och svarar efter 150–300 ms fördröjning. Steg 2 byter ut den mot en `fetch`-baserad implementation. **Ingen vy känner till vilken som används.**

Fördröjningen är inte kosmetik — den tvingar fram laddnings- och feltillstånd redan i steg 1, vilket är där de annars glöms bort.

### 6.4 Att bygga i ordning

1. Tokens, Shell och routing. Alla vyer som tomma stubbar.
2. Delade komponenter: `SplitPane`, `StatusChip`, `CopyField`, `SortableList`, `Modal`, `Toast`.
3. Dagordningar — enklaste fullständiga master–detail, sätter mönstret.
4. Namnlistor — samma mönster, bevisar att komponenterna bär.
5. Videoarkiv med trimdialog.
6. Live-resurser.
7. Papperskorg och Användare.
8. Projekt och Playout sist — de är mest sammansatta och drar nytta av allt annat.

### 6.5 Tillståndsstyrning för demo

Mockupen bör behålla den panel som låter en klicka sig genom live-resurs, enkoder, ondemand och synlighet. Den är värdefull för att visa och testa gränssnittet utan att sända på riktigt, och bör byggas som en komponent som kan stängas av med en flagga i steg 2.

---

## 7. Steg 2 – koppla mot API

### 7.1 Vad som byts

Bara `data/client.ts`. Om steg 1 gjorts rätt rör man ingen vy.

Praktiskt: behåll mock-implementationen och välj via miljövariabel (`VITE_API_BASE` satt → riktig klient, annars mock). Det gör det möjligt att arbeta vidare på vyer utan backend och att felsöka genom att växla.

### 7.2 Ordning

1. **Auth först.** Utan inloggning fungerar inget annat. Se hur den befintliga prototypen gör.
2. **Läsande mallar** — dagordningar och namnlistor. Enklast, och verifierar att typerna stämmer.
3. **Skrivande mallar** — create/update/trash.
4. **Videoarkiv** — läsning, sedan trimning (som troligen är asynkron, se nedan).
5. **Live-resurser.**
6. **Projekt och playout** sist, eftersom de har realtidskrav.

### 7.3 Realtid och polling

Tre saker ändras utan att användaren gör något:

| Vad | Förslag |
|---|---|
| Enkoderstatus och signalhälsa | Polla var 3–5 s medan Live-fliken eller playout är öppen. Räcker; EventBridge→WebSocket kan komma senare. |
| Trimjobbets status | Polla jobbet tills det är klart. Trimning är troligen asynkron transkodning. |
| Utspelning under sändning | Skrivande anrop som ska kännas omedelbara. |

**Utspelning behöver optimistisk uppdatering.** Operatören klickar och grafiken ska bytas direkt; tidslinjeposten läggs till lokalt och bekräftas av svaret. Misslyckas anropet ska raden markeras, inte försvinna tyst — en tappad kapitelmarkering upptäcks annars först vid publicering.

### 7.4 Felhantering

- Kvot nådd vid skapande av live-resurs → visa taket och länka till Live-resurser, inte ett rått felmeddelande.
- Rivning som misslyckas mot IVS → **markera inte resursen som riven lokalt.** Det är precis så zombie-resurser uppstår.
- Versionskonflikt vid redigering av en mall som någon annan ändrat → visa vad som ändrats, skriv inte över.

### 7.5 Att verifiera tidigt

Innan playout kopplas:

1. Vad recording-metadatan från IVS faktiskt innehåller — starttid i UTC, precision, och hur segment representeras vid glapp.
2. Att timed metadata når spelaren med acceptabel fördröjning.
3. Att trimning bevarar tidsrelationen till kapitelmärkena.

Punkt 1 och 3 är där modellen kan visa sig behöva justeras, och det är billigare att upptäcka innan vyerna är kopplade.

---

## 8. Öppna punkter

| Punkt | Status |
|---|---|
| Glapp i inspelning → offsetberäkning | Olöst, behöver verifieras mot IVS |
| Öppen otrimmad inspelning om operatören glömmer stänga | Medvetet lämnad |
| Publicering utan trimsteg | Inte beslutad |
| Permanent borttagning i papperskorgen | Inte byggd |
| Housekeeping av vilande IVS-resurser | Senare; taggning mot projekt-id finns redan |
| Parti/roll i namnlista | Senare, planerad som extra kolumn |
| Sök och operatörsstöd i namnlista under sändning | Senare |
| Lokala konton med lösenord | Kräver mer i användarvyn |
| Konfigurerbar retentionsperiod | Föreslagen, inte beslutad |
