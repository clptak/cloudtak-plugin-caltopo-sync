#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <path-to-CloudTAK-checkout>" >&2
    echo "" >&2
    echo "Symlinks <repo>/src into <CloudTAK>/api/web/plugins/caltopo-sync so the" >&2
    echo "host Vite build picks it up via import.meta.glob." >&2
    exit 1
fi

CLOUDTAK="$1"
PLUGIN_NAME="caltopo-sync"

REPO_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
SRC="${REPO_ROOT}/src"
DEST_PARENT="${CLOUDTAK}/api/web/plugins"
DEST="${DEST_PARENT}/${PLUGIN_NAME}"

if [ ! -d "${SRC}" ]; then
    echo "Error: source directory not found: ${SRC}" >&2
    exit 1
fi

if [ ! -d "${DEST_PARENT}" ]; then
    echo "Error: CloudTAK plugins directory not found: ${DEST_PARENT}" >&2
    echo "Is '${CLOUDTAK}' a valid CloudTAK checkout?" >&2
    exit 1
fi

if [ -L "${DEST}" ]; then
    EXISTING="$(readlink "${DEST}")"
    if [ "${EXISTING}" = "${SRC}" ]; then
        echo "Symlink already in place: ${DEST} -> ${SRC}"
    else
        echo "Replacing existing symlink: ${DEST} -> ${EXISTING}"
        rm "${DEST}"
        ln -s "${SRC}" "${DEST}"
        echo "Linked: ${DEST} -> ${SRC}"
    fi
elif [ -e "${DEST}" ]; then
    echo "Error: ${DEST} exists and is not a symlink. Refusing to overwrite." >&2
    exit 1
else
    ln -s "${SRC}" "${DEST}"
    echo "Linked: ${DEST} -> ${SRC}"
fi

echo ""
echo "Success."
echo ""
echo "Next steps:"
echo "  cd ${CLOUDTAK}/api/web"
echo "  npm run serve"
echo ""
echo "Vite resolves import.meta.glob once per module-graph build, so if you just"
echo "added the symlink while 'npm run serve' was running, restart it. Subsequent"
echo "edits inside src/ hot-reload normally."
