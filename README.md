# Filen CLI

![Contributors](https://img.shields.io/github/contributors/FilenCloudDienste/filen-cli?color=dark-green) ![Forks](https://img.shields.io/github/forks/FilenCloudDienste/filen-cli?style=social) ![Stargazers](https://img.shields.io/github/stars/FilenCloudDienste/filen-cli?style=social) ![Issues](https://img.shields.io/github/issues/FilenCloudDienste/filen-cli) ![License](https://img.shields.io/github/license/FilenCloudDienste/filen-cli)

The Filen CLI provides a set of useful tools for interacting with the cloud:
- [Accessing your Filen Drive](#access-your-filen-drive) in a stateless environment or [interactive mode](#interactive-mode)
- [Syncing](#syncing) locations with the cloud (just like the Desktop app)
- Mounting a [network drive](#network-drive-mounting)
- Running a [WebDAV mirror server](#webdav-server) of your [personal drive](#single-user), or multiple drives in [proxy mode](#proxy-mode)
- Running an [S3 mirror server](#s3-server)


# Installation and updates

You can download the latest binaries from the [release page](https://github.com/FilenCloudDienste/filen-cli/releases/latest).
Docker images are also available as [filen/cli](https://hub.docker.com/repository/docker/filen/cli) (see [below](#using-docker)).

The Filen CLI includes an automatic updater that checks for a new release every time the CLI is invoked
(after checking for updates, it will not check again for the next 10 minutes).
Invoke the CLI with the `--skip-update` flag to skip checking for updates.
(Use the `--force-update` flag to check for updates even if it was recently checked.)


# Usage

```
$ filen [options...]
```

Options:
- `--help`, `-h`: display usage information
- `--verbose`, `-v`: display additional information
- `--quiet`, `-q`: hide things like progress bars and additional logs
- `--email <email>` and `--password <password>` (optionally `--two-factor-code <code>`, `-c <code>`): specify credentials
- `--log-file <file>`: write logs to a file

### Authenticating

There are several ways to authenticate:

- Invoke the CLI and specify your Filen email and password. You can then choose to save them in a local encrypted configuration file. You can delete them later using `filen delete-credentials`.
- Invoke the CLI with the `--email` and `--password` (optionally `--two-factor-code`) arguments set.
- Put your credentials in the `FILEN_EMAIL` and `FILEN_PASSWORD` (optionally `FILEN_2FA_CODE`) environment variables.
- Store your Filen email and password in a file named `.filen-cli-credentials` where you invoke the CLI. Put your email and password in separate lines, in plain text (optionally 2FA code in third line).
- Export an "auth config" (which includes your Filen email, password and other details) using `filen export-auth-config`.
  This will produce a file named `.filen-cli-auth-config`, which you need to place where you invoke the CLI from.
  This option can be useful especially for clustered WebDAV/S3 servers, where otherwise too many login requests result in rate limiting.

If you have 2FA enabled and don't specify a 2FA code, you will be prompted for it.


## Access your Filen Drive

```
$ filen [options...] <cmd...>
```

Options:
- `--root <path>`, `-r <path`: execute a stateless command from a different working directory
- `--json`: format output as JSON
- `--no-autocomplete`: disable autocompletion (for performance or bandwidth reasons)

### Available commands

Many common Unix-style commands are available:

- `ls <path to directory>`: list items inside a directory (pass `-l` for more detailed output)
- `cat <path to file>`: print content of a text file
- `head <path to file>` / `tail <path to file>`: print first / last 10 lines of a text file (pass `-n 3` for only 3 lines etc.)
- `mkdir <path to directory>`: create a directory
- `rm <path>`: delete a file or directory (`--no-trash` to delete permanently)
- `stat <path>`: display information about a file or directory
- `statfs`: display information about your Filen cloud drive
- `whoami`: print the current user
- `mv <from> <to>` / `cp <from> <to>`: move or copy a file to a path (parent directory or file)

There are also non-standard commands specific to Filen:

- `download <cloud path> <local destination>`: download a file or directory from the cloud into a local destination
- `upload <local file> <cloud path>`: upload a local file into the cloud at a specified path
- `write <file> <content...>`: write text to a file
- `open <file>`: open a file locally in the associated application
- `edit <file>`: edit a file locally in the associated application (save and close to re-upload)
- `view <path>`: view a directory in the Web Drive (you can also invoke `filen drive` to quickly open the Web Drive)
- `favorites` / `recents`: display favorites or recents
- `favorite <path>` / `unfavorite <path>`: favorite or unfavorite a file or directory

### Interactive mode

Invoke the Filen CLI without any specified commands to enter interactive mode. 
There you can specify paths as absolute (starting with `/`) or relative to the current working directory (supports `.` and `..`).

Additional available commands:
- `help`: display available commands
- `cd <path>`: navigate to a different path
- `ls`: list items inside current directory
- `exit`: exit interactive mode

### Trash

- `filen trash`: view trash items
- `filen trash restore`: restore a trash item
- `filen trash delete`: permanently delete a trash item
- `filen trash empty`: permanently delete all trash items

### Public Links

- `filen links`: view all public links
- `filen links <path>`: create, view, edit or delete a public link for the given path


## Syncing

```
$ filen sync [sync pairs...] [--continuous]
```

Invoke `filen sync` to sync any locations with your Filen Drive. This is the same functionality you get with the Desktop app.

You must specify the sync pairs (`[sync pairs...]` above) as follows:
- **(central registry)** `filen sync`: Read the sync pairs from `$APP_DATA/filen_cli/syncPairs.json`. 
  This file must contain JSON of the type `{local: string, remote: string, syncMode: string, alias?: string, disableLocalTrash?: boolean, ignore?: string[]}[]`.
  `syncMode` can be `twoWay`, `localToCloud`, `localBackup`, `cloudToLocal` or `cloudBackup` (see the FAQ [here](https://filen.io/apps/desktop) on what that means).
- **(custom registry)** `filen sync <file>`: Read the sync pairs from a custom JSON file (same type as above).
- **(aliases)** `filen sync mypair myotherpair`: Sync the sync pairs from the central registry that were given the aliases `mypair` and `myotherpair`.
- **(literal pair)** `filen sync /local/path:twoWay:/cloud/path`: Sync the local path `/local/path` with the cloud path `/cloud/path` in two-way sync.
- **(shorthand for two-way pairs)** `filen sync /local:/cloud`: Sync `/local` with `/cloud` in two-way sync.
- **(other sync modes and abbreviations)** `filen sync /local1:localToCloud:/cloud1 /local2:ltc:/cloud2`: Sync `/local1` with `/cloud1` (and `/local2` with `/cloud2`) in local-to-cloud sync
  (other abbreviations are `tw` = `twoWay`, `ltc` = `localToCloud`, `lb` = `localBackup`, `ctl` = `cloudToLocal`, `cb` = `cloudBackup`).
- **(disable local trash)** `filen sync /local:/cloud --disable-local-trash`: Disable local trash

You can set the `--continuous` flag to keep syncing (instead of only syncing once).


## Network drive mounting

```
$ filen mount [mount point]
```

Invoke `filen mount` to mount a network drive that mirrors your Filen Drive. The default mount point is `X:` (Windows) / `/tmp/filen` (UNIX).

On Windows, [WinFSP](https://winfsp.dev/rel) needs to be installed. On Linux, [FUSE3](https://github.com/libfuse/libfuse) needs to be installed. On macOS, [FUSE-T](https://www.fuse-t.org/) or [macFUSE](https://osxfuse.github.io/) needs to be installed.

For more information, see also [FilenCloudDienste/filen-network-drive](https://github.com/FilenCloudDienste/filen-virtual-drive).


## WebDAV server

You can use the Filen CLI to start a WebDAV server that acts as a mirror server of your Filen Drive.

For more information, see also [FilenCloudDienste/filen-webdav](https://github.com/FilenCloudDienste/filen-webdav).

### Single user

```
$ filen webdav --w-user <...> --w-password <...> [options...]
```

Invoke `filen webdav` to start a local WebDAV server that mirrors your personal Filen Drive. 
This might be useful for allowing local applications to access your Filen Drive via WebDAV.

You must specify login credentials for connecting to the server using the `--w-user` and `--w-password` options (these credentials should be different from your Filen account credentials).

Options:

- `--w-https`: run the server on HTTPS instead of HTTP (using a self-signed certificate)
- `--w-hostname`: which hostname the server should be started on (default is 0.0.0.0)
- `--w-port`: which port the server should be started on (default is 80 or 443)
- `--w-auth-scheme`: the authentication scheme the server should use, "basic" or "digest" (default is basic)
- `--w-threads`: enables clustering, number of threads to use for the server (default is no clustering; explicitly set to 0 to set by CPU core count).
  If you experience rate-limiting using this, using an [auth config](#authenticating) might help.

### Proxy mode

```
$ filen webdav-proxy [options...]
```

Invoke the `filen webdav-proxy` to start a WebDAV server that allows any user to connect using their Filen account credentials and access their own Filen Drive.
This might be useful when hosting a proxy server for multiple users. 
Digest auth is not available for proxy mode.

**Important:** In proxy mode, the password has to be formatted as `password=yoursecretpassword&twoFactorAuthentication=<RECOVERY_CODE_OR_6_DIGIT_OTP_CODE>` (you can also leave out the `&twoFactorAuthentication=...` part if 2FA is disabled for your account).

Options: `--w-https`, `--w-hostname`, `--w-port`, `--w-threads` as above


## S3 server

```
$ filen s3 --s3-access-key-id <...> --s3-secret-access-key <...> [options...]
```

Invoke `filen s3` to start an S3 server that acts as a mirror server of your Filen Drive.
You must specify credentials (Access Key ID and Secret Access Key) for connecting to the server using the `--s3-access-key-id` and `--s3-secret-access-key` options (these credentials should be different from your Filen account credentials).

**Important:** When connecting to the S3 server, you need to enable `s3ForcePathStyle` and set the region to `filen`.

For more information, including on S3 compatibility, see also [FilenCloudDienste/filen-s3](https://github.com/FilenCloudDienste/filen-s3).

Options:

- `--s3-https`: run the server on HTTPS instead of HTTP (using a self-signed certificate)
- `--s3-hostname`: which hostname the server should be started on (default is 0.0.0.0)
- `--s3-port`: which port the server should be started on (default is 80 or 443)
- `--s3-threads`: enables clustering, number of threads to use for the server (default is no clustering; explicitly set to 0 to set by CPU core count).
  If you experience rate-limiting using this, using an [auth config](#authenticating) might help.

## Using Docker

You can run the CLI in a Docker container using the [`filen/cli`](https://hub.docker.com/repository/docker/filen/cli) image.

For example, to run a WebDAV/S3 server in a container, you can use a [Docker Compose](https://docs.docker.com/compose) file similar to this:

```yaml
services:
  filen-webdav:
    image: filen/cli:latest
    ports:
      - 80:80
    command: >
      --email <...>
      --password <...>
      webdav
      --w-user <...>
      --w-password <...>
```