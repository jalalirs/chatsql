#!/bin/bash

# Script to copy ChromaDB folder from backend container to local
# Usage: ./scripts/copy_chromadb.sh

echo "Copying ChromaDB folder from backend container to local..."

# Create local chroma_db directory if it doesn't exist
mkdir -p ./chroma_db

# Copy the entire chroma_db folder from the container
docker cp chatsql-backend-1:/app/chroma_db ./chroma_db

echo "✅ ChromaDB folder copied successfully to ./chroma_db"
echo "Contents:"
ls -la ./chroma_db/

echo ""
echo "Model directories:"
if [ -d "./chroma_db/models" ]; then
    ls -la ./chroma_db/models/
else
    echo "No models directory found"
fi
