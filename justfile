# Root task runner: the command interface for agents and humans. One
# project, one flat justfile: each toolchain gets a block in test, fix, and
# check. Commands must work on the host (through docker run against the
# project image) and inside the container (directly, no docker wrapper).

set shell := ["bash", "-cu"]

image := "stripe-planner:latest"

# True when running inside the project container (set by the Dockerfile).
in_container := `[ "${IN_CONTAINER:-}" = "1" ] && echo 1 || echo 0`

# Base docker run: mount the repo, remount .git read-only, non-interactive
# so commit hooks and other no-tty callers can use it; recipes needing a
# terminal add -it themselves.
docker_run := "docker run --rm -v \"$PWD\":/workspace -v \"$PWD/.git\":/workspace/.git:ro -w /workspace"

# Command fragments selected by execution context.
container_prefix := if in_container == "1" { "" } else { docker_run + " " + image + " " }
host_only_error  := if in_container == "1" { "echo 'error: run this on the host, not inside the container' >&2; exit 1" } else { "true" }
require_image    := if in_container == "1" { "true" } else { "docker image inspect " + image + " > /dev/null 2>&1 || { echo 'error: image " + image + " not found; run `just build` first' >&2; exit 1; }" }

# List available recipes.
default:
    @just --list

# Verify the image exists for use as a recipe dependency (no-op in container).
_require-image:
    @{{require_image}}

# Refresh the lock file and build the project image (host only).
build:
    @{{host_only_error}}
    @{{docker_run}} node:24-trixie-slim npm update --package-lock-only
    docker build --pull --no-cache -t {{image}} .

# Start a pi session in the project container (host only).
pi *args: _require-image
    @{{host_only_error}}
    # pass provider credentials from the host, for example: --env-file "$HOME/ai.env"
    @op run --env-file="$HOME/ai.env" -- {{docker_run}} -it -v "$HOME/.pi/agent:/root/.pi/agent" -e OPENROUTER_API_KEY -e DEEPSEEK_API_KEY -e LLAMA_BASE_URL=http://host.docker.internal:9931 -e PI_TELEMETRY {{image}} pi {{args}}

# Drop into a bash prompt in the project container (host only).
shell: _require-image
    @{{host_only_error}}
    @{{docker_run}} -it {{image}} bash || [ $? -eq 130 ]

# Run the test suites; one block per toolchain.
test *args: _require-image
    @echo "== typescript =="
    @{{container_prefix}}npm test -- {{args}}

# Bring the repo to a state where check passes; one block per toolchain.
fix *args: _require-image
    @# typescript
    @{{container_prefix}}npm run format
    @# regenerate any generated artifacts so check passes

# Definition-of-done gate: formatting, lint, types, artifact freshness.
# Read-only; one block per toolchain.
check *args: _require-image
    @# typescript
    @{{container_prefix}}npm run lint
    @{{container_prefix}}npm run typecheck

# Serve the vite dev server for the browser workflow (host only). The port
# is bound to loopback so it stays off the network.
dev: _require-image
    @{{host_only_error}}
    @{{docker_run}} -it -p 127.0.0.1:5173:5173 {{image}} npm run dev

# Remove the container image (host only).
clean:
    @{{host_only_error}}
    -docker image rm {{image}}

# Install the git hooks via pre-commit (host only).
hooks:
    @{{host_only_error}}
    uvx pre-commit install