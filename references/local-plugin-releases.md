# Private Local Plugin Releases

<!-- lifecycle: current — operational contract for versioning, publishing, activation, and rollback;
     update with scripts/local-plugin-release.mjs and the plugin manifests. -->

0th-skills uses SemVer as the release identity and a Git commit as the immutable artifact identity.
The release command publishes only to the private `0th-local` marketplace on the current machine. It
does not publish to the universal Plugin Directory or another public registry. GitHub remains the
source, PR, and tag history.

## Publish

After a release commit is merged, make sure both plugin manifests carry the same version, tag the
commit, and publish the immutable package:

```bash
git tag v0.5.0
git push origin v0.5.0
node scripts/local-plugin-release.mjs publish --install \
  --replace-selector 0th-skills@mini-local
```

Formal publishing requires a clean checkout with a matching `v<version>` tag. Changed content must
use a new version; publishing another commit under an existing version fails closed.

The default private registry is `~/.0th/plugins/marketplace`. Its local release ledger records the
version, commit, artifact path, creation time, and SHA-256 integrity digest. Activation atomically
updates the marketplace manifest and the shared runtime link.

## Inspect And Roll Back

Inspect the active release or activate an existing immutable artifact without rebuilding:

```bash
node scripts/local-plugin-release.mjs status
node scripts/local-plugin-release.mjs activate --version 0.3.4 --install
```

New Codex tasks load the activated version. An already-running task keeps the plugin instructions it
loaded at startup.
