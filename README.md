# Filen CLI

![Contributors](https://img.shields.io/github/contributors/FilenCloudDienste/filen-cli?color=dark-green) ![Forks](https://img.shields.io/github/forks/FilenCloudDienste/filen-cli?style=social) ![Stargazers](https://img.shields.io/github/stars/FilenCloudDienste/filen-cli?style=social) ![Issues](https://img.shields.io/github/issues/FilenCloudDienste/filen-cli) ![License](https://img.shields.io/github/license/FilenCloudDienste/filen-cli)

> [!IMPORTANT]
> The CLI is still work in progress. **DO NOT USE IN PRODUCTION YET**. It is not guaranteed to be stable.

The Filen CLI provides commands for interacting with the cloud filesystem.
You can use it in a stateless or interactive mode (see below).


# Usage

```
$ filen [options...]
```

Options:
- `--help`, `-h`: display usage information
- `--verbose`, `-v`: display additional information
- `--email <email>` and `--password <password>` (optionally `--two-factor-code`, `-c`): specify credentials
- `--quiet`, `-q`: hide things like progress bars
- `--json`: format output as JSON

### Authenticating

There are several ways to authenticate:

- Invoke the CLI and specify your Filen email and password. You can then choose to save them in a local encrypted configuration file. You can delete them later using the `--delete-credentials` flag.
- Invoke the CLI with the `--email` and `--password` (optionally `--two-factor-code`) arguments set.
- Put your credentials in the `FILEN_EMAIL` and `FILEN_PASSWORD` (optionally `FILEN_2FA_CODE`) environment variables.
- Store your Filen email and password in a file named `.filen-cli-credentials` where you invoke the CLI. Put your email and password in separate lines, in plain text (optionally 2FA code in third line).

If you have 2FA enabled and don't specify a 2FA code, you will be prompted for it.


## Access your Filen Drive

```
$ filen [options...] <cmd...>
```

Additional options:
- `--root <path>`, `-r <path`: execute a stateless command from a different working directory
- `--no-autocomplete`: disable autocompletion (for performance or bandwidth reasons)

### Available commands

- `ls <path to directory>`: list items inside a directory
- `cat <path to file>`: print content of a text file
- `mkdir <path to directory>`: create a directory
- `rm <path>`: delete a file or directory
- `download <cloud path> <local destination>`: download a file or directory from the cloud into a local destination
- `upload <local file> <cloud path>`: upload a local file into the cloud at a specified path
- `stat <path>`: display information about a file or directory
- `statfs`: display information about your Filen cloud drive
- `mv <from> <to>` / `cp <from> <to>`: move or copy a file to a path (parent directory or file)
- `write <file> <content...>`: write text to a file
- `open <file>`: open a file locally in the associated application
- `edit <file>`: edit a file locally in the associated application (save and close to re-upload)

### Interactive mode

Invoke the Filen CLI without any specified commands to enter interactive mode. 
There you can specify paths as absolute (starting with `/`) or relative to the current working directory (supports `.` and `..`).

Additional available commands:
- `cd <path>`: navigate to a different path
- `ls`: list items inside current directory
- `exit`: exit interactive mode


## WebDAV server

```
$ filen [options...] --webdav --w-username <...> --w-password <...> [--w-hostname <...>] [--w-port <...>]
```

Invoke the Filen CLI with the `--webdav` flag to start [a WebDAV server](https://github.com/FilenCloudDienste/filen-webdav) that acts as a local mirror server of your Filen Drive.

You must specify login credentials to the server using the `--w-username` and `--w-password` (they should be different from your Filen account credentials).
You can optionally specify the `--w-hostname` and `--w-port` customize which hostname and port the server is started on.