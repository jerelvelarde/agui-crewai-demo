.PHONY: install agent web dev verify test capabilities

install:
	cd agent && uv venv --python 3.12 .venv && uv pip install -e . && uv pip install pytest httpx
	cd web && pnpm install

agent:
	cd agent && .venv/bin/python -m cadence.server

web:
	cd web && pnpm dev

# Both halves. Ctrl-C stops both.
dev:
	@echo "agent → http://localhost:8008   web → http://localhost:3000"
	@$(MAKE) -j2 agent web

test:
	cd agent && .venv/bin/python -m pytest tests/ -q

# Drives a full brief and asserts the AG-UI stream carries each capability.
verify:
	cd agent && .venv/bin/python scripts/verify_stream.py

# What this install actually supports, straight from the package.
capabilities:
	@curl -s http://localhost:8008/healthz | python3 -m json.tool
