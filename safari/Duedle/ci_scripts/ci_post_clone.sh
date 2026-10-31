#!/bin/sh
set -eu

# Xcode Cloud checks out src but generated Safari resources are not tracked.
# Resolve the existing repository from this hook, including local invocations.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)
exec /usr/bin/env python3 "$REPOSITORY_ROOT/scripts/prepare_safari.py" --resources-only
