# @r3rc/tinker

Workspace toolkit CLI. Manages reference source repositories, encrypted secrets, environment profiles, and SSH keys.

## Why

tinker handles four common workflows in one tool: pinning source code for offline reading, encrypting secrets locally
without SaaS, switching between work/freelance/personal contexts (env + git config + SSH key), and keeping credentials
out of shell history. Existing tools each cover one of these well; tinker covers all four with a consistent interface.

```sh
deno task tinker --help
```

## Sources

Reference repositories cloned once to `~/.tinker/sources/` and symlinked into `.tinker/sources/` per project. Cloned
shallow (`--depth 1 --no-tags --single-branch`) — no history.

```sh
tinker sources add https://github.com/denoland/std   # clone + symlink
tinker sources list                                   # show status (cloned ✓/✗, linked ✓/✗, sha)
tinker sources sync                                   # re-clone all (picks up upstream changes)
tinker sources remove deno-std
```

## Secrets

AES-256-GCM encryption, PBKDF2-SHA256 key derivation (200k iterations). PIN prompted interactively. Vault stored at
`~/.tinker/secrets/vault.json`.

```sh
tinker secrets set AWS_KEY AKIAIOSFODNN7EXAMPLE   # encrypts and stores
tinker secrets get AWS_KEY                         # decrypts and prints
tinker secrets list                                # list key names (no PIN needed)
tinker secrets remove AWS_KEY
```

## Profiles

Named sets of environment variables, git config, and an SSH key. Activate with `eval`.

```sh
tinker profiles create work
tinker profiles set-var work AWS_PROFILE prod
tinker profiles set-var work TOKEN '$secret:my_token'   # resolved from vault at apply time
tinker profiles set-git work user.email me@work.com
tinker profiles list
tinker profiles show work
tinker profiles delete work

# Activate in current shell
eval $(tinker profiles apply work)
# → exports all vars, applies git config --global, activates SSH agent
```

### Active profile

`TINKER_PROFILE` is always exported when a profile is applied.

### Secret references

Values prefixed with `$secret:` are resolved from the encrypted vault at apply time. The PIN is prompted once and used
to decrypt all referenced secrets.

## SSH

Generates and manages per-profile SSH keys. On `profiles apply`, starts or reuses an `ssh-agent`, adds the profile key,
and exports `SSH_AUTH_SOCK` + `SSH_AGENT_PID`.

```sh
tinker ssh gen-key work                          # generates ~/.tinker/ssh/work/id_ed25519
tinker ssh set-key work ~/.ssh/existing_key      # point to an existing key
tinker ssh show work                             # show identity file and public key
tinker ssh remove-key work
```

Agent state is persisted at `~/.tinker/ssh/<profile>/agent.json` so the same agent is reused across `apply` calls.

## File layout

```
~/.tinker/
  sources/          # global clones
  secrets/
    salt            # PBKDF2 salt (16 bytes)
    vault.json      # encrypted key-value store
  profiles/
    <name>.json     # { name, env, git, ssh }
  ssh/
    <name>/
      id_ed25519    # generated key (if using gen-key)
      id_ed25519.pub
      agent.json    # running agent socket + PID

.tinker/            # per-project (in repo)
  config.json       # { sources: { name: url } }
  sources/
    <name> -> ~/.tinker/sources/<name>   # symlinks
```
