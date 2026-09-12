# My Micro plugin

This plugin ships a skill and a bundled Node CLI. End users do not need npm. Supported collection: macOS Codex app **26.908.40834 (8881)**. Other app builds stop before config collection.

The distribution repository is `ikekou/my-micro`, and the initial release is pinned to `v0.1.0`. `service.json` sets the default service origin to `https://my-micro.ikekou-20f.workers.dev`. These are release settings; they do not establish that deployment, remote installation, or posting has been verified. The repository and release tag must be published before using the remote installation commands below.

## Install in Codex

Use the official Codex CLI available in the application. Check for an existing installation with `codex plugin list --json`; reuse the matching plugin from this repository.

After the initial release has been published:

```sh
codex plugin marketplace add ikekou/my-micro --ref v0.1.0 --json
codex plugin add my-micro@<marketplaceName-from-add-result> --json
```

Confirm that `v0.1.0` exists in `ikekou/my-micro` and that `plugin add` returns manifest version `0.1.0`. For local development, replace the first command with `codex plugin marketplace add <repository-directory> --json`. The repository's marketplace name comes from the add result; do not assume it matches the plugin name.

Read `skills/share-micro/SKILL.md` beneath the `installedPath` returned by `plugin add`. Run `scripts/run.sh` from that same installed plugin. This explicit read and script invocation works within the current conversation, including when the plugin was absent at the start. Automatic skill discovery in a new task is a separate path.

`run.sh` uses Node 22+ from PATH or a standard Codex/ChatGPT application bundle. If needed, use Codex's `load_workspace_dependencies` result through `MY_MICRO_NODE`, or set `MY_MICRO_CODEX_APP` for a custom application directory. The collector's `--app` must identify the matching installed app. Runtime availability is checked independently of app compatibility.

## Update

For reinstalling the **same pinned tag**, refresh that configured marketplace and reinstall its plugin:

```sh
codex plugin marketplace upgrade <marketplaceName> --json
codex plugin add my-micro@<marketplaceName> --json
```

This does not advance a tag pin to a newer release. To switch to a **different published tag**, first use `codex plugin list --json` and `codex plugin marketplace list --json` to verify that the selected marketplace belongs to `ikekou/my-micro`, and record its current ref. Update only when the user requested the new version or it is required for the task. With the verified My Micro marketplace name:

```sh
codex plugin marketplace remove <marketplaceName> --json
codex plugin marketplace add ikekou/my-micro --ref <new-published-release-tag> --json
codex plugin add my-micro@<marketplaceName-from-add-result> --json
```

The tested CLI rejects an `add` that changes the ref while that marketplace is still registered. Removing and re-adding only this verified My Micro source switches the pin. Do not remove a similarly named marketplace from another repository. If registration of the new tag fails, stop the update and restore the recorded prior ref with the same `marketplace add` command; do not claim the new version is installed.

Check that `plugin add` returns the expected new manifest version, then explicitly read the skill at its returned `installedPath` for the current conversation. Use a new task for normal automatic skill discovery. This ref-switch procedure was verified with official CLI 0.154.0-alpha.6.2, an isolated Codex home, and a local Git fixture with two tags; no actual user's marketplace was changed.

For local plugin development, use Plugin Creator's `update_plugin_cachebuster.py` helper and the official reinstall command. Do not hand-edit the user's marketplace or config files.

## Commands

```sh
scripts/run.sh doctor
scripts/run.sh collect --out /private/tmp/my-micro-settings.json
scripts/run.sh draft --settings /private/tmp/my-micro-settings.json --title 'My Micro' --out /private/tmp/my-micro-draft.json
scripts/run.sh preview --draft /private/tmp/my-micro-draft.json
scripts/run.sh login
# Run only after explicit approval of the complete preview:
scripts/run.sh publish --draft /private/tmp/my-micro-draft.json --confirm <approvalHash>
scripts/run.sh logout
```

Service commands use the bundled production origin by default. For another deployment or local development, pass its origin with `--service` (for example, `--service http://localhost:5173`); `MY_MICRO_SERVICE` also overrides the bundled default. Publication always uses the origin saved in the reviewed draft.

Use new filenames for each collection/draft: existing files are never silently overwritten. Temporary files above are examples, not shared global state. Drafts contain only public candidate data, but keep them private until approved. Actual Codex configuration files are never modified.

My Micro credentials live separately in `~/Library/Application Support/My Micro`, with one private file per service origin. `MY_MICRO_HOME` selects an isolated directory for tests. Logout revokes the server session before removing the local credential; offline failure must be retried. Browser account management is also available.
