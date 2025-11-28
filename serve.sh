#!/bin/bash

# Simple script to serve the static site with Zola's development server
# Usage: ./serve.sh

echo "Starting Zola development server on http://localhost:1111"
echo "Press Ctrl+C to stop"
zola serve
