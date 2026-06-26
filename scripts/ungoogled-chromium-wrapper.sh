#!/usr/bin/env bash
# Launches Ungoogled Chromium (Flatpak) with all arguments forwarded.
# Playwright passes --remote-debugging-pipe / --remote-debugging-port as args;
# flatpak run forwards them into the sandbox transparently.
exec flatpak run --command=chromium io.github.ungoogled_software.ungoogled_chromium "$@"
