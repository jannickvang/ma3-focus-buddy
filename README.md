# MA3 Focus Buddy

Touch remote (PWA) for a grandMA3 console, optimized for iPad. Encoders, shapers and fixture/group selection. Commands are sent as OSC (`/cmd`) over UDP to the MA3.

## Download and run

1. Download the latest version for your platform from [Releases](../../releases/latest):
   - Windows: `ma3-focus-buddy-win-x64.zip`
   - macOS (Apple Silicon / Intel): `ma3-focus-buddy-macos-arm64.tar.gz` / `ma3-focus-buddy-macos-x64.tar.gz`
   - Linux: `ma3-focus-buddy-linux-x64.tar.gz`
2. Start the program. It prints an address like `http://192.168.1.20:3000`.
3. Open that address in Safari on the iPad (or another browser).
4. Tap the status label at the top right and enter the IP address and port of the MA3.

Windows and macOS warn about unsigned programs: choose "Run anyway" (macOS: right-click, "Open"). Allow firewall access on first start.

> Full instructions and troubleshooting: see the [manual](https://jannickvang.github.io/ma3-focus-buddy/).

## MA3 setup

Setup > In & Out > OSC: create a line with the same port as in the app, set **Receive Command** to Yes and enable "Enable Input". Set the readout to **percent**.

## Run from source

```
npm install
npm start            # http://localhost:3000
```

Environment variables: `PORT`, `MA3_IP`, `MA3_PORT`, `CONFIG_PATH`, `MA3_ATTRIBUTE_MAP`, `OSC_IN_PORT` (optional fixed UDP port for group feedback from the MA3 plugin; by default the app listens on the same port it uses to reach the MA3).

## Build binaries (.exe)

```
npm run build:exe    # output in dist/
```

## Versioning and releases

Versions follow [semver](https://semver.org/) and are tagged as `vX.Y.Z`. Pushing a tag automatically starts the GitHub Action that builds the binaries and publishes them as a release:

```
npm version patch    # or minor / major: bumps package.json and creates commit + tag
git push --follow-tags
```

## Contributing

Issues and pull requests are welcome.

## License

[MIT](LICENSE)
