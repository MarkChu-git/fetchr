#!/usr/bin/env bash
# Install the linux/amd64 scanner binaries used by verify. Checksums are the upstream SHA-256.
set -euo pipefail

destination="${1:?destination required}"
mkdir -p "$destination"

install_one() {
  url="$1"
  checksum="$2"
  archive="$3"
  binary="$4"
  archive_path="${destination}/${archive}"
  curl --fail --silent --show-error --location --output "$archive_path" "$url"
  printf '%s  %s\n' "$checksum" "$archive_path" | sha256sum --check --status
  tar --extract --gzip --file "$archive_path" --directory "$destination" "$binary"
  chmod +x "${destination}/${binary}"
}

install_one \
  "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz" \
  "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb" \
  "gitleaks.tar.gz" \
  "gitleaks"

install_one \
  "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz" \
  "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8" \
  "actionlint.tar.gz" \
  "actionlint"
