/* pkg build configuration. Auto-discovered by @yao-pkg/pkg (takes precedence
 * over the "pkg" field in package.json). The postBuild hook embeds the app
 * icon into every produced executable. */
module.exports = {
  pkg: {
    assets: ['public/**/*'],
    targets: ['node22-win-x64', 'node22-macos-arm64', 'node22-macos-x64', 'node22-linux-x64'],
    outputPath: 'dist',
    postBuild: 'node scripts/embed-icon.js "$PKG_OUTPUT"'
  }
};
