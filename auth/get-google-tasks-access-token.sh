#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Get Google Tasks Access Token
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🤖


export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

BASEPATH="$0"

[[ -h "$BASEPATH" ]] && BASEPATH=$(readlink "$BASEPATH")

BASEDIR=$(dirname "$BASEPATH")

cd "${BASEDIR}"

pnpm node index.js | tee >(pbcopy)





