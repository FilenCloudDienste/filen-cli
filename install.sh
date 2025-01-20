#!/usr/bin/env bash

# check if filen-cli is already installed
if [[ ! -z $(which filen) ]] ; then
  echo "Filen CLI is already installed"
  echo "You can install a different version using \`filen install <version>\` or \`filen install latest\`"
  echo "To uninstall, delete ~/.filen-cli and revert changes to your shell profile(s)"
else

  # determine platform as "linux" or "macos"
  if [[ "$(uname -s)" == "Linux" ]] ; then
    platform=linux
  elif [[ "$(uname -s)" == "Darwin" ]] ; then
    platform=macos
  fi

  # determine architecture as "x64" or "arm64"
  if [[ "$(uname -m)" == "aarch64" || "$(uname -m)" == "arm64" ]] ; then
    arch=arm64
  else
    arch=x64
  fi

  # fetch release info
  latest_release=$(curl -s https://api.github.com/repos/FilenCloudDienste/filen-cli/releases/latest)
  version=$(echo "$latest_release" | grep "tag_name" | cut -d \" -f 4)
  download_url=$(echo "$latest_release" | grep "browser_download_url.*$platform-$arch" | cut -d \" -f 4)

  echo "Installing Filen CLI $version ($platform-$arch)"

  # prepare install location ~/.filen-cli
  if [ ! -d ~/.filen-cli ] ; then mkdir -p ~/.filen-cli/bin ; fi

  # download binary and make executable
  echo "Downloading $download_url..."
  curl -o ~/.filen-cli/bin/filen -L --progress-bar $download_url
  chmod +x ~/.filen-cli/bin/filen

  # add to PATH
  if [[ $PATH == *$(echo ~)/\.filen-cli* ]] ; then
    echo "\$PATH already contains ~/.filen-cli"
  else
    export PATH=$PATH:~/.filen-cli/bin
    profileFileFound=0
    for profileFile in ~/.bashrc ~/.bash_profile ~/.zshrc ~/.profile ; do
      if [[ -f $profileFile ]] ; then
        profileFileFound=1
        printf "\n\n# filen-cli\nPATH=\$PATH:~/.filen-cli/bin\n" >> $profileFile
        echo "Added ~/.filen-cli/bin to \$PATH in $profileFile"
      fi
    done
    if [[ $profileFileFound == "0" ]] ; then
      echo "ERR: No shell profile file found (checked: ~/.bashrc ~/.bash_profile ~/.zshrc ~/.profile)"
    fi
  fi
  echo "Filen CLI installed as \`filen\` (you might need to restart your shell)"

  echo "To uninstall, delete ~/.filen-cli and revert changes to your shell profile(s)"

fi