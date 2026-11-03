# Project image: pi plus every toolchain the project needs, in one image.
# The node base carries the runtime and package manager that vite, vitest,
# and tsc need; keep the node pin in sync with the justfile lock refresh.

FROM node:24-trixie-slim

# System dependencies: git, task runner, search tools.
RUN apt-get update \
    && apt-get install -y --no-install-recommends bash git just ripgrep fd-find ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

ENV PI_ASK_USER_DISPLAY_MODE=inline \
    IN_CONTAINER=1

# pi via npm, kept up to date at build time.
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent \
    && pi --version \
    && pi update

WORKDIR /workspace

# typescript: bake the dependencies so a fresh container's first run needs no
# download. The npm cache warmed here lives outside /workspace and survives
# the runtime mount; node_modules under /workspace is shadowed by the
# mounted repo, so the session reinstalls from the warm cache on demand.
COPY package.json package-lock.json ./
RUN npm ci

CMD ["bash"]