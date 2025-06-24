#!/usr/bin/env python3
import os
import sys

# Patch the main.py file directly
main_py_path = "/app/app/main.py"

# Read the current file
with open(main_py_path, 'r') as f:
    content = f.read()

# Replace the hardcoded CORS origins with wildcard
content = content.replace(
    'allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"]',
    'allow_origins=["*"]'
)

# Write the file back
with open(main_py_path, 'w') as f:
    f.write(content)

print("CORS origins patched to allow all origins")

# Now start the app normally
os.system("uvicorn app.main:app --host 0.0.0.0 --port 6020")