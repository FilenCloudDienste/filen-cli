# Filen CLI

![Contributors](https://img.shields.io/github/contributors/FilenCloudDienste/filen-cli?color=dark-green) ![Forks](https://img.shields.io/github/forks/FilenCloudDienste/filen-cli?style=social) ![Stargazers](https://img.shields.io/github/stars/FilenCloudDienste/filen-cli?style=social) ![Issues](https://img.shields.io/github/issues/FilenCloudDienste/filen-cli) ![License](https://img.shields.io/github/license/FilenCloudDienste/filen-cli)

> [!IMPORTANT]
> The CLI is still work in progress. **DO NOT USE IN PRODUCTION YET**. It is not guaranteed to be stable.

The Filen CLI provides commands for interacting with the cloud filesystem.
You can use it in a stateless or interactive mode (see below).


## Usage
 
```
$ filen [options...] <cmd...>
```

Options:
- `--help`, `-h`: display usage information
- `--verbose`, `-v`: display additional information
- `--quiet`, `-q`: hide things like progress bars
- `--root <path>`, `-r <path`: execute a stateless command from a different working directory
- `--json`: format output as JSON

### Available commands

- `ls <path to directory>`: list items inside a directory
- `more <path to file>`: print content of a text file
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

### Authenticating

There are several ways to authenticate:
- Invoke the CLI and specify your Filen email and password. You can then choose to save them in your OS's keystore. You can delete them later using the `--delete-credentials` flag.
- Store your Filen email and password in a file named `.filen-cli-credentials` where you invoke the CLI. Put your email and password in separate lines, in plain text.
