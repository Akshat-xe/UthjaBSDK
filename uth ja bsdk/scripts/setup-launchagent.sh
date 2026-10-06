#!/usr/bin/env bash
set -euo pipefail

# Safe and reversible LaunchAgent management for UthJaBsdk local server on macOS.
# Targets ONLY com.uthjabsdk.server; never touches other running services or ports.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LABEL="com.uthjabsdk.server"
PLIST_DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
TEMPLATE_FILE="${SCRIPT_DIR}/launchagent/${LABEL}.plist.template"
LOGS_DIR="${PROJECT_DIR}/backend/data/logs"

COMMAND="${1:-status}"

get_node_path() {
  local node_bin
  node_bin="$(command -v node || true)"
  if [[ -z "${node_bin}" ]]; then
    if [[ -x "/opt/homebrew/bin/node" ]]; then
      node_bin="/opt/homebrew/bin/node"
    elif [[ -x "/usr/local/bin/node" ]]; then
      node_bin="/usr/local/bin/node"
    fi
  fi
  echo "${node_bin}"
}

do_status() {
  echo "=== LaunchAgent Status: ${LABEL} ==="
  if [[ -f "${PLIST_DEST}" ]]; then
    echo "Plist file: ${PLIST_DEST} (Installed)"
  else
    echo "Plist file: Not installed (${PLIST_DEST})"
  fi

  local uid
  uid="$(id -u)"
  if launchctl list "${LABEL}" &>/dev/null; then
    echo "Service state: Registered in launchd"
    launchctl list "${LABEL}"
  else
    echo "Service state: Not loaded in launchd"
  fi
}

do_install() {
  echo "=== Installing LaunchAgent: ${LABEL} ==="
  local node_path
  node_path="$(get_node_path)"
  if [[ -z "${node_path}" || ! -x "${node_path}" ]]; then
    echo "Error: node executable not found in PATH or standard homebrew locations." >&2
    exit 1
  fi

  if [[ ! -f "${TEMPLATE_FILE}" ]]; then
    echo "Error: Template file not found: ${TEMPLATE_FILE}" >&2
    exit 1
  fi

  mkdir -p "${HOME}/Library/LaunchAgents"
  mkdir -p "${LOGS_DIR}"
  chmod 0700 "${LOGS_DIR}" 2>/dev/null || true

  # Substitute template variables safely
  local safe_path="${PATH}:/opt/homebrew/bin:/usr/local/bin"
  sed \
    -e "s|{{NODE_PATH}}|${node_path}|g" \
    -e "s|{{PROJECT_DIR}}|${PROJECT_DIR}|g" \
    -e "s|{{LOGS_DIR}}|${LOGS_DIR}|g" \
    -e "s|{{PATH_ENV}}|${safe_path}|g" \
    -e "s|{{HOME_DIR}}|${HOME}|g" \
    "${TEMPLATE_FILE}" > "${PLIST_DEST}"

  chmod 0644 "${PLIST_DEST}"

  # Unload if previously running
  local uid
  uid="$(id -u)"
  if launchctl list "${LABEL}" &>/dev/null; then
    launchctl bootout "gui/${uid}/${LABEL}" 2>/dev/null || launchctl unload "${PLIST_DEST}" 2>/dev/null || true
  fi

  # Load new agent
  if launchctl bootstrap "gui/${uid}" "${PLIST_DEST}" 2>/dev/null; then
    echo "LaunchAgent bootstrapped successfully via launchctl bootstrap."
  else
    launchctl load "${PLIST_DEST}"
    echo "LaunchAgent loaded successfully via launchctl load."
  fi

  echo "LaunchAgent installed at: ${PLIST_DEST}"
  echo "Logs directory: ${LOGS_DIR}"
  do_status
}

do_uninstall() {
  echo "=== Uninstalling LaunchAgent: ${LABEL} ==="
  local uid
  uid="$(id -u)"

  if launchctl list "${LABEL}" &>/dev/null; then
    launchctl bootout "gui/${uid}/${LABEL}" 2>/dev/null || launchctl unload "${PLIST_DEST}" 2>/dev/null || true
    echo "Unloaded ${LABEL} from launchd."
  fi

  if [[ -f "${PLIST_DEST}" ]]; then
    rm -f "${PLIST_DEST}"
    echo "Removed ${PLIST_DEST}."
  fi

  echo "LaunchAgent uninstalled cleanly. No other services were modified."
}

case "${COMMAND}" in
  install)
    do_install
    ;;
  uninstall)
    do_uninstall
    ;;
  status)
    do_status
    ;;
  *)
    echo "Usage: $0 [install|uninstall|status]"
    exit 2
    ;;
esac
