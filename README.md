# Filen CLI

![Contributors](https://img.shields.io/github/contributors/FilenCloudDienste/filen-cli?color=dark-green) ![Forks](https://img.shields.io/github/forks/FilenCloudDienste/filen-cli?style=social) ![Stargazers](https://img.shields.io/github/stars/FilenCloudDienste/filen-cli?style=social) ![Issues](https://img.shields.io/github/issues/FilenCloudDienste/filen-cli) ![License](https://img.shields.io/github/license/FilenCloudDienste/filen-cli)

> [!IMPORTANT]
> The CLI is still work in progress. **DO NOT USE IN PRODUCTION YET**. It is not guaranteed to be stable.

The Filen CLI provides a set of useful tools for interacting with the cloud:
- [Accessing your Filen Drive](#access-your-filen-drive) in a stateless environment or [interactive mode](#interactive-mode)
- Running a [WebDAV mirror server](#webdav-server) of your [personal drive](#single-user), or multiple drives in [proxy mode](#proxy-mode)
- Running an [S3 mirror server](#s3-server)


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

Options:
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

You can use the Filen CLI to start a WebDAV server that acts as a mirror server of your Filen Drive.

For more information, see als [FilenCloudDienste/filen-webdav](https://github.com/FilenCloudDienste/filen-webdav).

### Single user

```
$ filen [options...] --webdav --w-user <...> --w-password <...> [options...]
```

Invoke the Filen CLI with the `--webdav` flag to start a local WebDAV server that mirrors your personal Filen Drive. 
This might be useful for allowing local applications to access your Filen Drive via WebDAV.

You must specify login credentials for connecting to the server using the `--w-user` and `--w-password` options (these credentials should be different from your Filen account credentials).

Options:

- `--w-https`: run the server on HTTPS instead of HTTP (using a self-signed certificate)
- `--w-hostname`: which hostname the server should be started on (default is 0.0.0.0)
- `--w-port`: which port the server should be started on (default is 80 or 443)
- `--w-auth-scheme`: the authentication scheme the server should use, "basic" or "digest" (default is basic)

### Proxy mode

```
$ filen [options...] --webdav-proxy [options...]
```

Invoke the Filen CLI with the `--webdav-proxy` flag to start a WebDAV server that allows any user to connect using their Filen account credentials and access their own Filen Drive.
This might be useful when hosting a proxy server for multiple users. 
Digest auth is not available for proxy mode.

**Important:** In proxy mode, the password has to be formatted as `password=yoursecretpassword&twoFactorAuthentication=<RECOVERY_CODE_OR_6_DIGIT_OTP_CODE>` (you can also leave out the `&twoFactorAuthentication=...` part if 2FA is disabled for your account).

Options: `--w-https`, `--w-hostname`, `--w-port` as above


## S3 server

```
$ filen --s3 --s3-access-key-id <...> --s3-secret-access-key <...> [options...]
```

Invoke the Filen CLI with the `--s3` flag to start an S3 server that acts as a mirror server of your Filen Drive.
You must specify credentials (Access Key ID and Secret Access Key) for connecting to the server using the `--s3-access-key-id` and `--s3-secret-access-key` options (these credentials should be different from your Filen account credentials).

**Important:** When connecting to the S3 server, you need to enable `s3ForcePathStyle` and set the region to `filen`.

For more information, including on S3 compatibility, see also [FilenCloudDienste/filen-s3](https://github.com/FilenCloudDienste/filen-s3).

Options:

- `--s3-https`: run the server on HTTPS instead of HTTP (using a self-signed certificate)
- `--s3-hostname`: which hostname the server should be started on (default is 0.0.0.0)
- `--s3-port`: which port the server should be started on (default is 80 or 443)