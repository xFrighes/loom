# Releasing Loom Packages

Loom uses Changesets for npm package versioning, changelog generation, and publish orchestration.

## Contributor Flow

1. Make the package change.
2. Run `bun run changeset`.
3. Pick the changed package and semver bump.
4. Commit the generated `.changeset/*.md` file with the change.

## Maintainer Flow

The `Release` workflow runs on every push to `main`.

- If unreleased changesets exist, it opens or updates a version PR.
- The version PR runs `changeset version`, updates package versions, writes package changelogs, and removes consumed changesets.
- Merging the version PR runs the workflow again. With no pending changesets, it runs `bun run release:publish`.

## npm Provenance

Publishing runs in GitHub Actions with `id-token: write` and `NPM_CONFIG_PROVENANCE=true`.

Configure each npm package as a trusted publisher for this repository and the `.github/workflows/release.yml` workflow. With trusted publishing enabled, npm generates provenance attestations from the GitHub OIDC identity. The release job uses Node 24 so the bundled npm CLI supports trusted publishing. If a package is not configured for trusted publishing, the publish step fails instead of silently publishing without provenance.

## Package Scope

The release workflow publishes npm packages managed by Changesets. `vscode-loom-kit` is marked private and ignored by Changesets because it is released as a VSIX through the VS Code Marketplace flow, not npm.
