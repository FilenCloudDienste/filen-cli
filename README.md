# Filen CLI

![Contributors](https://img.shields.io/github/contributors/FilenCloudDienste/filen-cli?color=dark-green) ![Forks](https://img.shields.io/github/forks/FilenCloudDienste/filen-cli?style=social) ![Stargazers](https://img.shields.io/github/stars/FilenCloudDienste/filen-cli?style=social) ![Issues](https://img.shields.io/github/issues/FilenCloudDienste/filen-cli) ![License](https://img.shields.io/github/license/FilenCloudDienste/filen-cli)

The Filen CLI provides a set of useful tools for interacting with the cloud:
- Accessing your Filen Drive in a stateless environment or interactive mode
- Syncing locations with the cloud (just like the Desktop app)
- Mounting a network drive
- Running a WebDAV mirror server of your personal drive, or multiple drives in proxy mode
- Running an S3 mirror server

> [!Note]
> Please **report bugs** on our [issues page](https://github.com/FilenCloudDienste/filen-cli/issues)! \
> **Feature requests** can be submitted on [features.filen.io](https://features.filen.io/?tags=cli).


## Installation and updates

You can download the latest binaries from the [release page](https://github.com/FilenCloudDienste/filen-cli/releases/latest), or execute the install script (Linux and macOS):
```
curl -sL https://filen.io/cli.sh | bash
```

Docker images are also available as [filen/cli](https://hub.docker.com/repository/docker/filen/cli) (see [below](#using-docker)).

The CLI is also available as an NPM package, which can be installed with `npm install --global @filen/cli` and then invoked as `filen`. The NPM repository always contains the latest canary releases (see below).

The Filen CLI includes an automatic updater, for which you can enable canary releases (if you want to be among the first to try out new features and fixes). You can also install any specific version from within the CLI. See `filen --help updates`.


## Documentation

You can find exhaustive but concise documentation from within the CLI using the `filen --help <cmd or topic>` command and at [docs.cli.filen.io](https://docs.cli.filen.io/). Longer-form documentation is at [docs.filen.io](https://docs.filen.io/docs/cli).
