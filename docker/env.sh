#!/bin/sh
# Runtime environment variable injection for the dashboard
# This replaces placeholder values in the built JS with runtime env vars

# Find and replace env vars in built JS files
for file in /usr/share/nginx/html/assets/*.js; do
  if [ -f "$file" ]; then
    # Replace API URL placeholder
    if [ -n "$VITE_API_URL" ]; then
      sed -i "s|__VITE_API_URL__|$VITE_API_URL|g" "$file"
    fi
  fi
done

echo "Environment variables injected"
