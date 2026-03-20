#!/usr/bin/env bash
./repo.sh || exit 1
./repo2.sh || exit 1
./repo-interaction.sh || exit 1
./repo-visual.sh || exit 1
./repo-performance.sh || exit 1

./repo-layout.sh || exit 1
./repo-snap.sh || exit 1
./repo-zoom.sh || exit 1
./repo-ui-explorer.sh || exit 1
./repo-command-matrix.sh || exit 1
./repo-ui-enhanced.sh || exit 1
./repo-ui-state.sh || exit 1
./repo-designer-god.sh || exit 1

echo "RF FULL SYSTEM VERIFICATION PASSED"
