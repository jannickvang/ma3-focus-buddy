---
title: Handleiding
---

# MA3 Focus Buddy handleiding

**[English](index.md) | Nederlands**

Stapsgewijze instructies om de app werkend te krijgen. Gaat er iets mis, zie dan [Probleemoplossing](#probleemoplossing).

## 1. Wat je nodig hebt

- Een computer waarop de app draait (Windows, macOS of Linux). Dit hoeft niet de MA3-computer te zijn.
- Een iPad, telefoon of andere browser in **hetzelfde netwerk** als die computer.
- Een grandMA3 die in dat netwerk bereikbaar is.

> **MA3 onPC:** in onze tests verwerkte MA3 onPC de commando's pas nadat fysieke MA3-consolehardware was aangesloten. Zonder hardware verschenen de commando's wel in het OSC-protocol, maar de MA deed niets. Test daarom eerst met echte hardware.

## 2. De app starten

1. Download de juiste versie van [Releases](https://github.com/jannickvang/ma3-focus-buddy/releases/latest).
2. Pak het bestand uit en start het programma.
3. **Windows:** kies bij "Windows protected your PC" voor *More info* en daarna *Run anyway*. Kies bij de firewallmelding voor **Allow access** (privénetwerk). Zonder dit kan de iPad de app niet bereiken.
4. **macOS:** rechtsklik op het bestand, kies *Open* en bevestig. Maak het bestand zo nodig eerst uitvoerbaar met `chmod +x <bestand>`.
5. Er opent een venster met een adres, bijvoorbeeld `Open on your iPad: http://192.168.1.20:3000`. Houd dit venster open. Sluit je het, dan stopt de app.

Open dat adres op de iPad in Safari. Voeg de app eventueel toe aan het beginscherm: deelknop, daarna *Zet op beginscherm*.

## 3. Verbinden met de MA3

### In de MA3

1. Ga naar **Setup > In & Out > OSC**.
2. Zet **Enable Input** bovenaan aan.
3. Maak een regel aan (bijv. regel 3) met:
   - **Destination IP / Remote IP:** het IP-adres van de computer waarop de app draait.
   - **Port:** een vrije poort, bijvoorbeeld `8000`. Onthoud deze.
   - **Receive Command:** `Yes`.
4. Zet de **readout op Percent** (anders is een stap van `1` veel groter dan 1%).

### In de app

1. Tik op de **statusindicator** rechtsboven.
2. Vul het **IP-adres van de MA3** in en dezelfde **poort** als op de MA3. Gebruik overal dezelfde poort.
3. Tik op **Save**.

Het IP-adres staat standaard op `127.0.0.1`. Dat werkt alleen als de MA3 op dezelfde computer draait als de app.

## 4. Controleren dat het werkt

- Kijk in het **OSC-protocol** van de MA3 of de commando's aankomen.
- Draai aan een encoder in de app. Het attribuut zou in de MA3 moeten veranderen.
- Gebeurt er niets terwijl de commando's wel in het protocol verschijnen, zie dan de opmerking over hardware hierboven.

## 5. Aandachtspunten

| Onderwerp | Wat te doen |
|---|---|
| **Poort** | Gebruik dezelfde poort in de MA3 en in de app. De app stuurt via UDP naar die poort. |
| **Netwerk** | iPad, de computer met de app en de MA3 moeten elkaar kunnen bereiken. Gast- of clientisolatie op de wifi blokkeert dit. |
| **Firewall** | Sta de app toe op privénetwerken (TCP 3000 voor de iPad, UDP voor de MA3-poort). |
| **Readout** | Zet op **Percent**, anders zijn de stappen veel te groot. |
| **Attribuutnamen** | De app gebruikt `Pan`, `Tilt`, `Zoom`, `Focus1`, `Blade 1A` t/m `Blade 4A` en `Blade1 Rot` t/m `Blade4 Rot`. Gebruiken jouw fixtures andere namen, pas dan `MA3_ATTRIBUTE_MAP` aan (zie hieronder). |
| **Instellingen** | Het enkele tandwiel opent één instellingenmenu voor de MA3-verbinding, frost-presets, de onderste knoppenbalk en clientbeheer. De server pingt periodiek elke ingestelde MA3-host en toont of deze bereikbaar is. |
| **Set** | De knop stuurt `Set Selection Property 'Active'`. Bedoeld om na Next/Previous de hele groep opnieuw te selecteren. |
| **Groepen** | De Fixtures-pagina toont de groepen van datapool 2 met nummer en naam. Een tik op een groep selecteert de fixtures in de MA3 (`SelectFixtures Datapool 2 Group <nummer>`). |
| **Toggles** | De Toggles-pagina bevat configureerbare knoppen. Elke knop stuurt `Toggle Sequence <nummer>` naar de MA3. Voeg knoppen toe, herschik en verwijder ze via het tandwiel op de pagina. |

## Groepen uit de MA3 (plugin)

De Fixtures-pagina laadt de groepen van datapool 2 uit de console. Hiervoor is één kleine plugin in het showfile nodig; de PWA triggert hem, dus de console stuurt alleen data wanneer de pagina open is.

1. Importeer [ma3-plugin/MA3FocusBuddyGroups.lua](https://github.com/jannickvang/ma3-focus-buddy/blob/main/ma3-plugin/MA3FocusBuddyGroups.lua) in je showfile (of voeg hem één keer toe aan je template-showfile).
2. Wijs in **Setup > In & Out > OSC** de OSC-regel naar de computer met de app, met **dezelfde poort als in de app ingesteld** (standaard 8000). Zet output aan op die regel. De app luistert voor feedback op diezelfde UDP-poort, dus één OSC-regel is genoeg.
3. Zet in de plugin `OSC_LINE` op het nummer van die OSC-regel.
4. Open de Fixtures-pagina. De app stuurt `Plugin "MA3 Focus Buddy Groups"` en toont *Waiting for the MA3…* tot de groepslijst binnen is. De lijst ververst automatisch zolang de pagina open is.

De plugin stuurt het groepsnummer en de naam van elke groep in datapool 2 via OSC. Komt er niets binnen, controleer dan of de plugin in het showfile staat en of het OSC-regelnummer klopt. De app print bij het opstarten `OSC feedback listening on UDP port <poort>` voor elke ingestelde MA3-poort. Wil je een vaste feedbackpoort, gebruik dan de omgevingsvariabele `OSC_IN_PORT`.

## Kleurenpresets uit de MA3 (plugin)

De Colours-pagina toont de kleurenpresets (presetpool 4) van de geselecteerde datapool, met hun echte namen.

1. Importeer [ma3-plugin/MA3FocusBuddyColours.lua](https://github.com/jannickvang/ma3-focus-buddy/blob/main/ma3-plugin/MA3FocusBuddyColours.lua) in je showfile (naast de groepenplugin).
2. Zet `OSC_LINE` in de plugin op dezelfde OSC-regel als de groepenplugin, en stel `START` en `COUNT` in op het presetbereik dat je gebruikt (standaard 507–607).
3. Tik op de Colours-pagina op **Load**. De app stuurt `Plugin "MA3 Focus Buddy Colours"` en toont *Waiting for the MA3…* tot de lijst binnen is.

Een tik op een preset stuurt `At Preset 4.<nummer>` naar de MA3. Het bereik staat vast in de plugin, dus de app geeft geen argumenten mee.

## 6. Aanpassen

- **Instellingen en clients:** alle instellingen (MA3-doel, frost-presets, onderste balk, toggles en de laatst geopende pagina) worden door de server per browserclient opgeslagen; er blijft niets op het toestel staan. Bij de allereerste verbinding worden instellingen die alleen op het toestel bestonden eenmalig naar de server gemigreerd. De clientlijst in Instellingen toont bekende clients en laat ze verwijderen.
- **Bereikbaarheid:** de statusindicator gebruikt een ping op de achtergrond om de ingestelde host te controleren. Hij is oranje terwijl een nieuw opgeslagen doel wordt gecontroleerd, groen na een geslaagde ping en rood wanneer de host onbereikbaar is. Een geslaagde ping bevestigt alleen netwerkbereikbaarheid; hij bevestigt niet dat MA3 naar OSC-commando's luistert of ze verwerkt.
- **Frost-presets:** de vier frostknoppen roepen standaard MA3-presets 5.1 t/m 5.4 op. Stel de presetnummers in via Instellingen.
- **Onderste knoppenbalk:** de knoppen zijn configureerbaar in Instellingen (volgorde, zichtbaarheid, commando). Standaard: Highlight, Next, Previous, Set, Full, Clear, Esc.
- **Attribuutnamen overschrijven:** zet de omgevingsvariabele `MA3_ATTRIBUTE_MAP` met JSON, bijvoorbeeld `{"Focus":"Focus1"}`.
- **Poort van de app zelf:** standaard 3000. Pas aan met de omgevingsvariabele `PORT`.
- **Instellingen:** per-client instellingen worden opgeslagen in `ma3-focus-buddy-config.json` naast het programma. Maak een back-up van dit bestand als je de clientlijst en instellingen wilt behouden.

## Probleemoplossing

**De pagina opent niet op de iPad.**
Controleer of de iPad en computer in hetzelfde netwerk zitten, of je het adres uit het venster hebt gebruikt (niet `localhost`) en of de firewall de app toestaat.

**De status rechtsboven zegt Offline.**
De iPad bereikt de app niet meer. Controleer of het programma nog draait.

**Commando's verschijnen in het MA3-protocol, maar er gebeurt niets.**
Controleer *Receive Command = Yes* en *Enable Input*. Test met aangesloten MA3-hardware (zie hierboven).

**Commando's komen niet aan bij de MA3.**
Controleer het IP en de poort in de app, de poort in de MA3-regel en de firewall van de MA3-computer (UDP).

**Encoders maken te grote of te kleine stappen.**
Zet de readout op **Percent**.

**Een attribuut reageert niet.**
Controleer de attribuutnaam in de MA3 en pas `MA3_ATTRIBUTE_MAP` aan.

**Na een nieuwe versie zie je nog de oude app.**
Ververs de pagina geforceerd, of sluit de app op de iPad volledig en open hem opnieuw. De app gebruikt een cache.

**Poort 3000 is in gebruik.**
Start met een andere poort, bijvoorbeeld `PORT=3100`.
