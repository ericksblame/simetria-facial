#!/bin/bash
# Doble clic para abrir la app de simetría facial en el navegador.
cd "$(dirname "$0")"
exec /usr/bin/python3 server.py
