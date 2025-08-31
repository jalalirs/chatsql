#!/usr/bin/env python3
"""
Script to populate the database with SQL training questions from ChromaDB JSON.
This script parses the chromadb_exploration.json file and inserts the SQL Q&A pairs
into the model_training_questions table.
"""

import json
import sys
import uuid
from pathlib import Path
from typing import Dict, List, Any

# Add the parent directory to the path so we can import app modules
sys.path.append(str(Path(__file__).parent.parent))

async def populate_training_questions():
    """Populate the database with training questions from ChromaDB JSON."""
    try:
        from app.core.database import get_async_db
        from app.models.database import ModelTrainingQuestion
        from sqlalchemy import select
        
        # Load the ChromaDB exploration data
        json_file = Path(__file__).parent.parent / "chromadb_exploration.json"
        if not json_file.exists():
            print(f"Error: {json_file} not found!")
            return
        
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Get the model ID from the database (assuming we want the first model)
        async for db in get_async_db():
            # Get the first model (should be the 'spl' model)
            from app.models.database import Model
            from sqlalchemy import select
            
            stmt = select(Model).where(Model.name == 'spl')
            result = await db.execute(stmt)
            model = result.scalar_one_or_none()
            
            if not model:
                print("Error: No 'spl' model found in database!")
                return
            
            model_id = model.id
            print(f"Found model: {model.name} (ID: {model_id})")
            
            # Extract SQL questions from the 'sql' collection
            sql_collection = None
            for collection in data.get('collections', []):
                if collection['name'] == 'sql':
                    sql_collection = collection
                    break
            
            if not sql_collection:
                print("Error: No 'sql' collection found in ChromaDB data!")
                return
            
            print(f"Found {len(sql_collection['documents'])} SQL questions in ChromaDB")
            
            # Process each SQL document
            questions_added = 0
            for doc in sql_collection['documents']:
                try:
                    # Parse the document content (it's a JSON string)
                    doc_content = json.loads(doc['document'])
                    question = doc_content.get('question', '')
                    sql = doc_content.get('sql', '')
                    
                    if not question or not sql:
                        print(f"Skipping document {doc['id']}: missing question or SQL")
                        continue
                    
                    # Check if this question already exists
                    existing_stmt = select(ModelTrainingQuestion).where(
                        ModelTrainingQuestion.model_id == model_id,
                        ModelTrainingQuestion.question == question
                    )
                    existing_result = await db.execute(existing_stmt)
                    existing = existing_result.scalar_one_or_none()
                    
                    if existing:
                        print(f"Question already exists: {question[:50]}...")
                        continue
                    
                    # Determine query type and difficulty based on SQL complexity
                    query_type = determine_query_type(sql)
                    difficulty = determine_difficulty(sql)
                    
                    # Extract involved columns from SQL
                    involved_columns = extract_involved_columns(sql)
                    
                    # Create new training question
                    new_question = ModelTrainingQuestion(
                        id=uuid.uuid4(),
                        model_id=model_id,
                        question=question,
                        sql=sql,
                        involved_columns=involved_columns,
                        query_type=query_type,
                        difficulty=difficulty,
                        generated_by='manual',  # Assuming these are manual entries
                        is_validated=True,      # Assuming these are validated
                        validation_notes='Imported from ChromaDB training data'
                    )
                    
                    db.add(new_question)
                    questions_added += 1
                    print(f"Added question: {question[:50]}...")
                    
                except Exception as e:
                    print(f"Error processing document {doc['id']}: {e}")
                    continue
            
            # Commit all changes
            await db.commit()
            print(f"\nSuccessfully added {questions_added} training questions to the database!")
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

def determine_query_type(sql: str) -> str:
    """Determine the query type based on SQL complexity."""
    sql_upper = sql.upper()
    
    if 'WITH' in sql_upper:
        return 'cte'
    elif 'JOIN' in sql_upper:
        return 'join'
    elif 'GROUP BY' in sql_upper:
        return 'aggregation'
    elif 'ORDER BY' in sql_upper:
        return 'ordering'
    elif 'WHERE' in sql_upper:
        return 'filtered_select'
    else:
        return 'simple_select'

def determine_difficulty(sql: str) -> str:
    """Determine the difficulty level based on SQL complexity."""
    sql_upper = sql.upper()
    
    # Count complexity indicators
    complexity_score = 0
    
    if 'WITH' in sql_upper:
        complexity_score += 3
    if 'JOIN' in sql_upper:
        complexity_score += 2
    if 'GROUP BY' in sql_upper:
        complexity_score += 1
    if 'ORDER BY' in sql_upper:
        complexity_score += 1
    if 'CASE' in sql_upper:
        complexity_score += 2
    if 'DECLARE' in sql_upper:
        complexity_score += 2
    if 'UNION' in sql_upper:
        complexity_score += 3
    if 'SUBQUERY' in sql_upper or '(' in sql_upper and 'SELECT' in sql_upper:
        complexity_score += 2
    
    if complexity_score >= 5:
        return 'hard'
    elif complexity_score >= 2:
        return 'medium'
    else:
        return 'easy'

def extract_involved_columns(sql: str) -> List[Dict[str, str]]:
    """Extract involved columns from SQL query."""
    columns = []
    
    # Simple regex-like extraction for dbo.table.column patterns
    import re
    pattern = r'dbo\.(\w+)\.(\w+)'
    matches = re.findall(pattern, sql)
    
    for table, column in matches:
        columns.append({
            "table": f"dbo.{table}",
            "column": column
        })
    
    return columns

if __name__ == "__main__":
    import asyncio
    asyncio.run(populate_training_questions())
