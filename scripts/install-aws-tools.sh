#!/usr/bin/env bash
# Install AWS CLI v2 and AWS SAM CLI for Apna Intern deployment scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

install_aws_cli() {
  export PATH="$HOME/.local/bin:$PATH"
  if command -v aws >/dev/null 2>&1; then
    echo "✓ AWS CLI already installed: $(aws --version 2>&1 | head -1)"
    return 0
  fi

  if [[ -x "$HOME/.local/bin/aws" ]]; then
    export PATH="$HOME/.local/bin:$PATH"
    echo "✓ AWS CLI installed: $(aws --version 2>&1 | head -1)"
    return 0
  fi

  echo "→ Installing AWS CLI v2..."
  tmp="$(mktemp -d)"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "$tmp/awscliv2.zip"
  unzip -q "$tmp/awscliv2.zip" -d "$tmp"
  "$tmp/aws/install" -i "$HOME/.local/aws-cli" -b "$HOME/.local/bin"
  rm -rf "$tmp"
  export PATH="$HOME/.local/bin:$PATH"
  echo "✓ AWS CLI installed: $(aws --version 2>&1 | head -1)"
}

install_sam_cli() {
  export PATH="$HOME/.local/bin:$PATH"
  if command -v sam >/dev/null 2>&1; then
    echo "✓ SAM CLI already installed: $(sam --version 2>&1 | head -1)"
    return 0
  fi

  echo "→ Installing AWS SAM CLI..."
  pip install -q --user aws-sam-cli 2>/dev/null || pip install -q aws-sam-cli
  export PATH="$HOME/.local/bin:$PATH"
  echo "✓ SAM CLI installed: $(sam --version 2>&1 | head -1)"
}

mkdir -p "$HOME/.local/bin"
install_aws_cli
install_sam_cli

echo ""
echo "Add to your shell PATH if needed:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
