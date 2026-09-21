# ungap Presenter – projektflöde och vyer

Sammanfattning av resonemang, 21 september 2026. Dokumentet beskriver beslut och öppna frågor i ord. Det innehåller ingen design.

## Utgångspunkt

Resonemanget började i projektvyn, som idag samlar kopplingar (dagordning, namnlista, Meeting), synlighet, rubrik, spelarlänk samt flikarna Live och Ondemand. Vyn blandar sysslor av helt olika karaktär i en platt lista, och ingesten finns på två ställen: i projektvyns Live-flik och i Playout.

Den viktigaste slutsatsen är att flödet aldrig behövde ändras. Det nuvarande gränssnittet är ett resultat av försök att skapa ett nytt flöde. Det äldre flödet har fungerat utmärkt i femton år och behålls. Det som förbättras är strukturen runt det.

## Förutsättningar

- En och samma operatör gör allt arbete: förbereder, sänder och efterarbetar.
- Operatören avgör alltid själv. Systemet gissar aldrig och låser inte åtgärder utifrån teknisk status.
- Ett möte som hålls över flera dagar blir ett nytt projekt per dag. Ett projekt har en sändning, en inspelning, en spelarlänk och ett läge.
- Publiken finns främst i efterhand, så kvaliteten på ondemand är i praktiken produkten.

## Två oberoende axlar

### Läge

Fyra lägen, övertagna från den tidigare appen: **Before > Live > After > Ondemand**.

Lägena beskriver sändningens tillstånd, det vill säga vad spelaren visar just nu, inte operatörens arbetsmoment.

- **Before** – väntesida med meddelande.
- **Live** – sändningen.
- **After** – meddelande, ursprungligen "Tack för att du tittade. Snart finns en ondemand att titta på". Meddelandet är redigerbart.
- **Ondemand** – inspelningen.

Operatören sätter läget manuellt. Läget är inte låst av om signal finns eller inte. Läget ligger kvar i Before tills operatören byter till Live.

Lägena är fyra likvärdiga tillstånd i en vanlig ordning, inte en förloppsmätare. After är ett giltigt slutläge, eftersom det inte är ovanligt att en sändning aldrig går till ondemand. Ett projekt som ligger kvar i After ska därför inte se ofärdigt ut, varken i listan eller i headern.

After har tre betydelser med samma spelare och olika text: nyss avslutat, slutläge utan ondemand, och tillfälligt avpublicerat. Ett fritt redigerbart meddelande räcker för att bära skillnaden. Standardtexten bör inte lova en ondemand som kanske aldrig kommer.

### Synlighet

**Öppen / Stängd**, oberoende av läge. Synligheten är en ren överstyrning: Stängd visar ingenting oavsett läge, Öppen visar det läget säger. Syftet är att kunna dölja det som sker i vilket läge som helst. Exempel: spelaren öppnas när förberedelserna är klara men före Live, och kan stängas igen om mer förberedelse behövs.

Synligheten ska kunna ändras från alla vyer, eftersom operatören är ensam och ska kunna stänga direkt var hen än befinner sig.

## Lägesbyten och bekräftelser

Flödet kan backa, och hopp över flera steg är tillåtna. Principen är att bekräftelse krävs när bytet tar bort eller ändrar något publiken ser. Bekräftelsen ska säga konkret vad som händer, inte bara fråga "Är du säker?".

| Byte | Bekräftelse | Kommentar |
|---|---|---|
| Before → Live | Nej | Normalt flöde |
| Live → After | **Ja** | Beslutat. Avslutar sändningen för publiken |
| After → Ondemand | Nej, eventuellt lätt | Normalt flöde, publicerar |
| Ondemand → After | Ja | Avpublicering. Bekräftelsen bör visa After-meddelandet och låta operatören ändra det |
| After → Live | Ja | Behövs bara vid misstag, eftersom varje mötesdag är ett eget projekt |
| Ondemand → Live | Ja | |
| Live → Before | Ja | Bryter en pågående sändning |

Avpublicering är inget eget koncept, utan lägesbytet Ondemand → After med ett passande meddelande.

## Vyer

### Två vyer per projekt

Projektets detaljvy utgår. Förberedelserna kan göras i Playout, så det behövs bara två vyer:

- **Livesändning** (nuvarande Playout) – gäller lägena Before och Live.
- **Ondemand** (ny vy) – gäller lägena After och Ondemand.

Läget avgör vilken vy som öppnas när man väljer ett projekt. Flikarna Live och Ondemand i dagens projektvy tas bort.

Båda vyerna har samma uppbyggnad, med ett förberedande och ett skarpt läge:

- **Livesändning i Before** är en arbetsyta: koppla dagordning och namnlista, skapa ingest, kontrollera signal, redigera Before-meddelandet. **I Live** är den en ren sändningskontroll, där setup-delarna tonas bort.
- **Ondemand-vyn i After** är en arbetsyta: redigera After-meddelandet, trimma, justera punkter, publicera eller medvetet låta bli. **I Ondemand** är den en förvaltningsyta där ändringar slår igenom direkt för publiken.

Det skarpa läget ska kännas skarpt i båda vyerna.

### Presentation

Livesändning lägger sig ovanpå och expanderar för att ge plats och minska distraktion. Ondemand-vyn gör likadant. Konsekvens väger tyngre än att varje vy är optimal för sig, eftersom det är samma operatör som använder båda. Vänstermenyn ska finnas åtkomlig för snabb access till dagordningar och namnlistor.

Alternativen egen helsida, eget fönster och inbäddning i projektvyn övervägdes och valdes bort. Eget fönster kan bli ett tillval senare för operatörer med två skärmar.

### Projektlistan

Dagens lista med detaljer till höger ersätts av enbart en lista, där ett val öppnar projektet i full bredd. Eftersom detaljvyn försvinner får listan mer ansvar. Den bör visa läge och synlighet per projekt, och eventuellt ge direkt åtkomst till spelarlänken och till projektåtgärder som byt namn, duplicera och papperskorg.

## Gemensam header

Identisk i båda vyerna, så att den lärs in en gång och läge och synlighet alltid sitter på samma plats.

Innehåll:

- **Rubrik** – redigeras inline.
- **Lägesväljare** – Before / Live / After / Ondemand. En kontroll, inte bara en indikator.
- **Synlighet** – Öppen / Stängd, ändringsbar.
- **Spelarlänk** – central och lätt åtkomlig i alla vyer, med kopiera och öppna i ny flik.
- **Ingång till projektinställningar.**

Ska inte ligga i headern:

- Ingest- och signalstatus – hör till vyn Livesändning.
- Klockan – kritisk i Livesändning, ointressant i Ondemand.
- Kopplingarna – hör till vyn Livesändning.
- Tillbakalänken till projektlistan – hör till lagret, inte till headern.

## Projektinställningar

En plats som nås från headern i båda vyerna. Idag rymmer den lite, till exempel Meeting-kopplingen och projektets id. Senare tillkommer player-layout och annat som dyker upp under vägen. Ingången reserveras redan nu, så att headern inte behöver byggas om.

## Ändringar i publicerad ondemand

- **Små ändringar** görs on-the-fly och stänger inte den publicerade sändningen.
- **Större ändringar** – grova fel i videoströmmen, grova felstavningar av namn, många kapitel helt ur synk – kräver att man avpublicerar, det vill säga går tillbaka till After med ett passande meddelande.

Operatören avgör själv var gränsen går. Systemet klassificerar inte ändringar och tvingar inte fram avpublicering. Det behövs ingen utkast- eller versionshantering.

## Övervägda och bortvalda flöden

- **Signalstyrt flöde** – läget följer tekniken. Bortvalt: en testsignal går ut till publiken, en svajig uppkoppling avslutar mötet, en paus ser ut som ett slut.
- **Schemastyrt flöde** – läget byter vid klockslag. Bortvalt: möten börjar sällan på utsatt tid.
- **Två lägen plus publicering** – Bortvalt: Before och After är olika saker för publiken, och After som slutläge försvinner.
- **Checklista eller wizard** – Bortvalt: kopplingarna är frivilliga, ordningen är inte fast, och en van operatör vill inte bli ledd.
- **Flera sändningar per projekt** – Bortvalt: ett projekt per dag är begripligt för både operatör och publik.

Tre delar som kan tas med utan att ändra flödet:

- Starttid som ren information (väntesidan, sortering av listan).
- En passiv överblick över förberedelserna i Before – vad som är kopplat, om ingest finns, om signalen är ok, om spelaren är öppen. En statusrad, inga tvingande steg.
- Eventuellt en påminnelse vid lång signalförlust, utan att systemet agerar.

## Öppna frågor

1. **Namnet.** Ska "Playout" heta "Livesändning", så att det framgår att vyn enbart gäller live?
2. **Växling mellan vyerna.** Ska vyn följa med automatiskt vid lägesbyte över gränsen Live → After, och behövs en manuell växling för undantagen?
3. **Spelaren.** Vad publiken ser i varje kombination av läge och synlighet tas i ett senare resonemang.
4. **Sparande i Ondemand-vyn.** Autospar eller uttryckligt spara per ändring, givet att ändringar i läget Ondemand går direkt till publiken.
5. **Fördröjning.** Slår ändringar igenom direkt, eller finns en cache-fördröjning som operatören behöver känna till?
6. **Before-meddelandet.** Bekräfta att Before har ett redigerbart meddelande på samma sätt som After.
7. **URL.** Ska vyerna ha egna adresser som överlever omladdning? Idag ligger adressen kvar på projektlistan när Playout är öppen.
8. **Ondemand-vyns innehåll.** Vilka verktyg och moment som ska finnas är ännu inte genomgånget.
9. **Projektlistans innehåll.** Exakt vad varje rad visar och vilka åtgärder som nås direkt.
