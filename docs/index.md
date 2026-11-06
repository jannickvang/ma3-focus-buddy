---
title: Manual
---

# MA3 Focus Buddy manual

**English | [Nederlands](index.nl.md)**

Step by step instructions to get the app working. If something goes wrong, see [Troubleshooting](#troubleshooting).

## 1. What you need

- A computer that runs the app (Windows, macOS or Linux). This does not have to be the MA3 computer.
- An iPad, phone or other browser on the **same network** as that computer.
- A grandMA3 that is reachable on that network.

> **MA3 onPC:** in our tests, MA3 onPC only processed the commands after physical MA3 console hardware was connected. Without hardware the commands showed up in the OSC protocol, but the MA did nothing. So test with real hardware first.

## 2. Start the app

1. Download the right version from [Releases](https://github.com/jannickvang/ma3-focus-buddy/releases/latest).
2. Unpack the file and start the program.
3. **Windows:** at "Windows protected your PC" choose *More info* and then *Run anyway*. At the firewall prompt choose **Allow access** (private network). Without this the iPad cannot reach the app.
4. **macOS:** right-click the file, choose *Open* and confirm. If needed, make it executable first with `chmod +x <file>`.
5. A window opens with an address, for example `Open on your iPad: http://192.168.1.20:3000`. Keep this window open. If you close it, the app stops.

Open that address on the iPad in Safari. Optionally add the app to the home screen: Share button, then *Add to Home Screen*.

## 3. Connect to the MA3

### In the MA3

1. Go to **Setup > In & Out > OSC**.
2. Turn on **Enable Input** at the top.
3. Create a line (e.g. line 3) with:
   - **Destination IP / Remote IP:** the IP address of the computer running the app.
   - **Port:** a free port, for example `8000`. Remember it.
   - **Receive Command:** `Yes`.
4. Set the **readout to Percent** (otherwise a step of `1` is much larger than 1%).

### In the app

1. Tap the **status label** at the top right.
2. Enter the **IP address of the MA3** and the same **port** as on the MA3. Use one and the same port everywhere.
3. Tap **Save**.

The IP address defaults to `127.0.0.1`. That only works if the MA3 runs on the same computer as the app.

## 4. Check that it works

- Look in the MA3 **OSC protocol** to see whether commands arrive.
- Turn an encoder in the app. The attribute should change in the MA3.
- If nothing happens while the commands do show up in the protocol, see the hardware note above.

## 5. Things to watch out for

| Topic | What to do |
|---|---|
| **Port** | Use the same port in the MA3 and in the app. The app sends over UDP to that port. |
| **Network** | iPad, the computer running the app and the MA3 must be able to reach each other. Guest or client isolation on the wifi blocks this. |
| **Firewall** | Allow the app on private networks (TCP 3000 for the iPad, UDP for the MA3 port). |
| **Readout** | Set to **Percent**, otherwise the steps are far too large. |
| **Attribute names** | The app uses `Pan`, `Tilt`, `Zoom`, `Focus1`, `Blade 1A` to `Blade 4A` and `Blade1 Rot` to `Blade4 Rot`. If your fixtures use other names, adjust `MA3_ATTRIBUTE_MAP` (see below). |
| **Settings** | The single gear button opens one settings menu for the MA3 connection, frost presets, bottom button bar and client management. The server periodically pings each configured MA3 host and shows whether it is reachable. |
| **Set** | The button sends `Set Selection Property 'Active'`. It is meant to select the whole group again after Next/Previous. |
| **Groups** | The Fixtures page shows the groups of datapool 2 with number and name. Tapping a group selects its fixtures in the MA3 (`SelectFixtures Datapool 2 Group <number>`). |
| **Toggles** | The Toggles page contains configurable buttons. Each button sends `Toggle Sequence <number>` to the MA3. Add, reorder and delete buttons via the gear on the page. |

## Groups from the MA3 (plugin)

The Fixtures page loads the groups of datapool 2 from the console. This needs one small plugin in the showfile; the PWA triggers it, so the console only sends data when the page is open.

1. Import [ma3-plugin/MA3FocusBuddyGroups.lua](https://github.com/jannickvang/ma3-focus-buddy/blob/main/ma3-plugin/MA3FocusBuddyGroups.lua) into your showfile (or add it to your template showfile once).
2. In **Setup > In & Out > OSC**, point the OSC line at the computer running the app with the **same port as configured in the app** (default 8000). Enable output on that line. The app listens for feedback on that same UDP port, so one OSC line is enough.
3. In the plugin, set `OSC_LINE` to the number of that OSC line.
4. Open the Fixtures page. The app sends `Plugin "MA3 Focus Buddy Groups"` and shows *Waiting for the MA3…* until the group list arrives. The list refreshes automatically while the page is open.

The plugin sends the group number and name of every group in datapool 2 over OSC. If nothing arrives, check that the plugin exists in the showfile and that the OSC line number matches. The app prints `OSC feedback listening on UDP port <port>` at startup for every configured MA3 port. To use a fixed feedback port instead, set the environment variable `OSC_IN_PORT`.

## Colour presets from the MA3 (plugin)

The Colours page shows the colour presets (preset pool 4) of the selected datapool, with their real names.

1. Import [ma3-plugin/MA3FocusBuddyColours.lua](https://github.com/jannickvang/ma3-focus-buddy/blob/main/ma3-plugin/MA3FocusBuddyColours.lua) into your showfile (next to the groups plugin).
2. Set `OSC_LINE` in the plugin to the same OSC line as the groups plugin, and set `START` and `COUNT` to the preset range you use (default 507–607).
3. On the Colours page, tap **Load**. The app sends `Plugin "MA3 Focus Buddy Colours"` and shows *Waiting for the MA3…* until the list arrives.

Tapping a preset sends `At Preset 4.<number>` to the MA3. The range is fixed in the plugin, so the app does not pass any arguments.

## 6. Customize

- **Settings and clients:** all settings (MA3 target, frost presets, bottom bar, toggles and the last opened page) are stored by the server per browser client; nothing is kept on the device. On the very first connection, settings that only existed on the device are migrated to the server once. The client list in Settings shows known clients and allows removing them.
- **Reachability:** the status indicator uses a background network ping to check the configured host. It is orange while a newly saved target is being checked, green after a successful ping and red when the host is unreachable. A successful ping only confirms network reachability; it does not confirm that MA3 is listening for or processing OSC commands.
- **Frost presets:** the four frost buttons recall MA3 presets 5.1 through 5.4 by default. Configure the preset numbers in Settings.
- **Bottom button bar:** the buttons are configurable in Settings (order, visibility, command). Default: Highlight, Next, Previous, Set, Full, Clear, Esc.
- **Override attribute names:** set the environment variable `MA3_ATTRIBUTE_MAP` with JSON, for example `{"Focus":"Focus1"}`.
- **Port of the app itself:** 3000 by default. Change it with the environment variable `PORT`.
- **Settings:** per-client settings are stored in `ma3-focus-buddy-config.json` next to the program. Keep this file backed up if you want to preserve the client list and settings.

## Troubleshooting

**The page does not open on the iPad.**
Check that the iPad and computer are on the same network, that you used the address from the window (not `localhost`), and that the firewall allows the app.

**The status at the top right says Offline.**
The iPad no longer reaches the app. Check that the program is still running.

**Commands appear in the MA3 protocol, but nothing happens.**
Check *Receive Command = Yes* and *Enable Input*. Test with connected MA3 hardware (see above).

**Commands do not arrive at the MA3.**
Check the IP and port in the app, the port in the MA3 line and the firewall of the MA3 computer (UDP).

**Encoders make steps that are too large or small.**
Set the readout to **Percent**.

**An attribute does not respond.**
Check the attribute name in the MA3 and adjust `MA3_ATTRIBUTE_MAP`.

**After a new version you still see the old app.**
Hard refresh the page, or fully close the app on the iPad and reopen it. The app uses a cache.

**Port 3000 is in use.**
Start with another port, for example `PORT=3100`.
