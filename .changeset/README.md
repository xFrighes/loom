# Changesets

Add one changeset per user-facing package change:

```sh
bun run changeset
```

The release workflow turns merged changesets into a version PR. Merging that PR publishes the changed npm packages from GitHub Actions.
