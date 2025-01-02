#!/usr/bin/env bash

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
location=~/.filen-cli
if [ ! -d $location ] ; then mkdir -p $location/bin ; fi

# download binary and make executable
echo "Downloading $download_url..."
curl -o $location/bin/filen -L --progress-bar $download_url
chmod +x $location/bin/filen

# add to PATH
if [[ $PATH == *"$location"* ]] ; then
    echo "\$PATH already contains $location"
else
    export PATH=$PATH:$location/bin
    printf "\n\n# filen-cli\nPATH=\$PATH:$location/bin\n" >> ~/.profile
    echo "Added $location/bin to \$PATH in ~/.profile"
fi
echo "Filen CLI installed as \`filen\` (you might need to restart your shell)"

echo "To uninstall, delete $location and revert changes to ~/.profile"
