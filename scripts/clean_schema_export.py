#!/usr/bin/env python3
"""
Script to clean schema export JSON files by removing all column information except:
- column_name
- column_type
- description

Usage: python clean_schema_export.py <input_file> [output_file]
"""

import json
import sys
import os
from pathlib import Path

def clean_schema_export(input_file, output_file=None):
    """
    Load JSON schema export and clean columns to only keep column_name, column_type, and description
    """
    try:
        # Load the JSON file
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        print(f"Loaded schema export from: {input_file}")
        print(f"Original data structure: {list(data.keys())}")
        
        # Check if this is a single table export or full schema export
        if 'table' in data:
            # Single table export
            print("Detected single table export")
            table_data = data['table']
            if 'columns' in table_data:
                original_columns = table_data['columns']
                print(f"Original columns count: {len(original_columns)}")
                
                # Clean columns to only keep column_name, column_type, and description
                cleaned_columns = []
                for col in original_columns:
                    cleaned_col = {
                        'column_name': col.get('column_name', ''),
                        'column_type': col.get('data_type', ''),
                        'description': col.get('description', '')
                    }
                    cleaned_columns.append(cleaned_col)
                
                # Update the data structure
                data['table']['columns'] = cleaned_columns
                print(f"Cleaned columns count: {len(cleaned_columns)}")
                
        elif 'tables' in data:
            # Full schema export
            print("Detected full schema export")
            tables = data['tables']
            print(f"Original tables count: {len(tables)}")
            
            for table in tables:
                if 'columns' in table:
                    original_columns = table['columns']
                    print(f"Table '{table.get('table_name', 'unknown')}': {len(original_columns)} columns")
                    
                    # Clean columns to only keep column_name, column_type, and description
                    cleaned_columns = []
                    for col in original_columns:
                        cleaned_col = {
                            'column_name': col.get('column_name', ''),
                            'column_type': col.get('data_type', ''),
                            'description': col.get('description', '')
                        }
                        cleaned_columns.append(cleaned_col)
                    
                    # Update the table columns
                    table['columns'] = cleaned_columns
                    print(f"  -> Cleaned to {len(cleaned_columns)} columns")
        
        # Determine output filename if not provided
        if output_file is None:
            input_path = Path(input_file)
            output_file = input_path.parent / f"{input_path.stem}_cleaned{input_path.suffix}"
        
        # Save the cleaned data
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"Cleaned schema export saved to: {output_file}")
        
        # Show sample of cleaned data
        if 'table' in data and 'columns' in data['table']:
            print("\nSample of cleaned columns:")
            for i, col in enumerate(data['table']['columns'][:3]):  # Show first 3 columns
                desc = col['description']
                truncated_desc = desc[:50] + "..." if len(desc) > 50 else desc
                print(f"  {i+1}. {col['column_name']}: {col['column_type']} - {truncated_desc}")
        elif 'tables' in data and len(data['tables']) > 0:
            first_table = data['tables'][0]
            if 'columns' in first_table:
                print(f"\nSample of cleaned columns from '{first_table.get('table_name', 'unknown')}':")
                for i, col in enumerate(first_table['columns'][:3]):  # Show first 3 columns
                    desc = col['description']
                    truncated_desc = desc[:50] + "..." if len(desc) > 50 else desc
                    print(f"  {i+1}. {col['column_name']}: {col['column_type']} - {truncated_desc}")
        
        return True
        
    except FileNotFoundError:
        print(f"Error: File '{input_file}' not found")
        return False
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in file '{input_file}': {e}")
        return False
    except Exception as e:
        print(f"Error processing file: {e}")
        return False

def main():
    """Main function to handle command line arguments"""
    if len(sys.argv) < 2:
        print("Usage: python clean_schema_export.py <input_file> [output_file]")
        print("\nExample:")
        print("  python clean_schema_export.py schema_export.json")
        print("  python clean_schema_export.py schema_export.json cleaned_schema.json")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not os.path.exists(input_file):
        print(f"Error: Input file '{input_file}' does not exist")
        sys.exit(1)
    
    success = clean_schema_export(input_file, output_file)
    if success:
        print("\n✅ Schema export cleaned successfully!")
    else:
        print("\n❌ Failed to clean schema export")
        sys.exit(1)

if __name__ == "__main__":
    main()
