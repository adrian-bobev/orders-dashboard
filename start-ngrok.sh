#!/bin/bash

echo "🚀 Starting ngrok tunnel for webhook testing..."
echo ""
echo "This will expose your local server at http://localhost:3000"
echo "to a public URL that WooCommerce can reach"
echo ""
echo "If you don't have ngrok installed:"
echo "  brew install ngrok"
echo ""
echo "Press Ctrl+C to stop the tunnel"
echo ""
echo "---"

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed"
    echo ""
    echo "Install it with: brew install ngrok"
    echo "Or download from: https://ngrok.com/download"
    exit 1
fi

# Start ngrok
ngrok http 3000
