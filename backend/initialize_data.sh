#!/bin/bash

# SPL Data Initialization Script
# This script runs the SPL database initialization from the backend container

echo "Starting SPL data initialization..."

# Navigate to the SPL data directory
cd /app/initialize/data/spl

# Install required Python packages if not already installed
echo "Installing required packages..."
pip install pandas pyodbc

# Run the initialization script
echo "Running SPL database initialization..."
python create_table.py

echo "SPL data initialization completed!" 