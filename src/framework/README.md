# Filen CLI Architecture

This document describes the "Features" architecture of the Filen CLI. It is not meant to give a conclusive overview, but to highlight noteworthy aspects. 


### `/src/app` vs. `/src/framework`

The entire codebase is split into two parts: `/framework` is built like a CLI app framework, which handles CLI-related functions, such as command parsing (argument parsing, autocompletion), help pages, an interactive mode, ..., each made to fit our needs while being agnostic to Filen and therefore having extensibility in mind. `/app` contains everything specific to this Filen CLI app, and is built like an app using the above framework. 


### "Features" architecture

`/framework/features.ts` describes how individual CLI commands (e. g. "cd", "sync") should be implemented as individual "features". Every feature has a command signature consisting of one or more command strings (aliases) and an array of arguments (positional or "--options"). The arguments need to be constructed using functions like `f.arg()`, `f.required()` etc., which handle validation, autocompletion and parsing (e. g. of file paths) and provide type-safety. Both features and arguments have descriptions associated with them, making it possible to generate all documentation / `--help` pages (as well as a static HTML rendering of the same, see `/filen-cli-docs`) automatically based on the actual command defintions, creating a single source of truth and keeping all documentation close to code. The code for executing a feature is supplied with a "feature context", which should contain all information necessary to run a feature (therefore keeping features more encapsulated, improving maintenance as well as testability), as well as the user-supplied args (with type-safety). 