#!/usr/bin/env python3
"""
Script to explore ChromaDB and output all documents in a structured JSON format.
This script will connect to the ChromaDB instance through Vanna and extract all collections, documents, and metadata.
"""

import json
import os
import sys
import argparse
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime

# Add the parent directory to the path so we can import app modules
sys.path.append(str(Path(__file__).parent.parent))

def get_vanna_instance(db_path: str):
    """Initialize and return a Vanna instance to access ChromaDB."""
    try:
        from app.core.vanna_wrapper import MyVanna
        from app.config import settings
        
        # Create Vanna config similar to how the service does it
        vanna_config = {
            "api_key": settings.OPENAI_API_KEY,
            "base_url": settings.OPENAI_BASE_URL,
            "model": settings.OPENAI_MODEL,
            "embedding_model": settings.OPENAI_EMBEDDING_MODEL,
            "path": db_path
        }
        
        vanna_instance = MyVanna(config=vanna_config)
        return vanna_instance
    except Exception as e:
        print(f"Error creating Vanna instance: {e}")
        return None



def explore_chromadb(db_path: str) -> Dict[str, Any]:
    """Explore the entire ChromaDB instance directly."""
    try:
        import chromadb
        from chromadb.config import Settings
        
        # Create ChromaDB client directly
        client = chromadb.PersistentClient(
            path=db_path,
            settings=Settings(anonymized_telemetry=False)
        )
        
        # Get all collections
        collections = client.list_collections()
        
        exploration_data = {
            "timestamp": datetime.now().isoformat(),
            "chromadb_info": {
                "path": db_path,
                "collections_count": len(collections)
            },
            "collections": []
        }
        
        total_documents = 0
        
        for collection in collections:
            try:
                # Get collection details
                coll = client.get_collection(name=collection.name)
                
                # Get all documents in the collection
                results = coll.get()
                
                collection_data = {
                    "name": collection.name,
                    "metadata": collection.metadata,
                    "count": collection.count(),
                    "documents": []
                }
                
                if results and results['documents']:
                    for i, doc in enumerate(results['documents']):
                        doc_data = {
                            "id": results['ids'][i] if results['ids'] else f"doc_{i}",
                            "document": doc,
                            "metadata": results['metadatas'][i] if results['metadatas'] else None,
                            "embedding_length": len(results['embeddings'][i]) if results['embeddings'] else 0
                        }
                        collection_data["documents"].append(doc_data)
                        total_documents += 1
                
                exploration_data["collections"].append(collection_data)
                
            except Exception as e:
                print(f"Error processing collection {collection.name}: {e}")
                exploration_data["collections"].append({
                    "name": collection.name,
                    "error": str(e)
                })
        
        exploration_data["chromadb_info"]["total_documents"] = total_documents
        
        return exploration_data
        
    except Exception as e:
        return {"error": f"Error exploring ChromaDB directly: {e}"}

def save_exploration_data(data: Dict[str, Any], output_file: str = "chromadb_exploration.json"):
    """Save the exploration data to a JSON file."""
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)
        print(f"Exploration data saved to: {output_file}")
    except Exception as e:
        print(f"Error saving to file: {e}")

def print_summary(data: Dict[str, Any]):
    """Print a summary of the exploration results."""
    if "error" in data:
        print(f"Error: {data['error']}")
        return
    
    print(f"\n=== ChromaDB Exploration Summary ===")
    print(f"Timestamp: {data['timestamp']}")
    print(f"Path: {data['chromadb_info']['path']}")
    print(f"Collections Count: {data['chromadb_info']['collections_count']}")
    print(f"Total Documents: {data['chromadb_info']['total_documents']}")
    
    if data['collections']:
        print(f"\nCollections:")
        for collection in data['collections']:
            if 'error' in collection:
                print(f"  - {collection['name']}: ERROR - {collection['error']}")
            else:
                print(f"  - {collection['name']}: {collection['count']} documents")
                if collection['metadata']:
                    print(f"    Metadata: {collection['metadata']}")
                if collection['documents']:
                    print(f"    Sample documents:")
                    for doc in collection['documents'][:3]:  # Show first 3 docs
                        print(f"      * {doc['id']}: {doc['document'][:100]}...")
                    if len(collection['documents']) > 3:
                        print(f"      ... and {len(collection['documents']) - 3} more")
    
    print("=" * 40)

def main():
    """Main function to run the ChromaDB exploration."""
    parser = argparse.ArgumentParser(description="Explore ChromaDB and output documents in JSON format")
    parser.add_argument("--db-path", "-p", default="./chroma_db", 
                       help="Path to ChromaDB directory (default: ./chroma_db)")
    parser.add_argument("--output", "-o", default="chromadb_exploration.json",
                       help="Output JSON file name (default: chromadb_exploration.json)")
    
    args = parser.parse_args()
    
    print(f"Starting ChromaDB exploration at: {args.db_path}")
    
    # Explore ChromaDB
    exploration_data = explore_chromadb(args.db_path)
    
    if "error" in exploration_data:
        print(f"Exploration failed: {exploration_data['error']}")
        return
    
    # Print summary
    print_summary(exploration_data)
    
    # Save to file
    save_exploration_data(exploration_data, args.output)
    
    # Also save to scripts directory
    scripts_output = Path(__file__).parent / args.output
    save_exploration_data(exploration_data, str(scripts_output))
    
    print(f"\nExploration completed successfully! Output saved to: {args.output}")

if __name__ == "__main__":
    main()
