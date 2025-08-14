import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Path, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from sse_starlette import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from uuid import UUID
import asyncio
import json

from app.core.database import get_async_db
from app.dependencies import get_current_user, get_current_user_from_query

logger = logging.getLogger(__name__)
from app.models.schemas import (
    ModelTrainingDocumentationCreate, ModelTrainingDocumentationUpdate, ModelTrainingDocumentationResponse,
    ModelTrainingQuestionCreate, ModelTrainingQuestionUpdate, ModelTrainingQuestionResponse,
    ModelTrainingColumnCreate, ModelTrainingColumnUpdate, ModelTrainingColumnResponse,
    ModelTrainingRequest, ModelTrainingResponse, ModelQueryRequest, ModelQueryResponse,
    QuestionGenerationRequest, QuestionGenerationResponse
)
from app.services.training_service import training_service
from app.models.database import User

router = APIRouter(prefix="/training", tags=["training"])

# Model Training Operations
@router.post("/models/{model_id}/train", response_model=ModelTrainingResponse)
async def train_model(
    model_id: UUID = Path(..., description="Model ID"),
    training_request: ModelTrainingRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Train a model with generated training data"""
    try:
        num_examples = training_request.num_examples if training_request else 50
        
        result = await training_service.train_model(
            db=db,
            model_id=str(model_id),
            user=current_user,
            num_examples=num_examples
        )
        
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return ModelTrainingResponse(
            task_id=str(model_id),  # For now, using model_id as task_id
            status="training",
            message=f"Training started with {result.get('total_generated', 0)} examples"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to train model: {str(e)}")

@router.post("/models/{model_id}/generate-data")
async def generate_training_data(
    model_id: UUID = Path(..., description="Model ID"),
    num_examples: int = Query(50, ge=1, le=200, description="Number of examples to generate"),
    background_tasks: BackgroundTasks = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Generate training data for a model"""
    try:
        result = await training_service.generate_training_data(
            db=db,
            user=current_user,
            model_id=str(model_id),
            num_examples=num_examples,
            task_id=str(model_id)  # For now, using model_id as task_id
        )
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error_message)
        
        return {
            "success": True,
            "model_id": str(model_id),
            "total_generated": result.total_generated,
            "failed_count": result.failed_count,
            "message": f"Generated {result.total_generated} training examples"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate training data: {str(e)}")

@router.post("/models/{model_id}/query", response_model=ModelQueryResponse)
async def query_model(
    model_id: UUID = Path(..., description="Model ID"),
    query_request: ModelQueryRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Query a trained model"""
    try:
        question = query_request.question if query_request else ""
        if not question:
            raise HTTPException(status_code=400, detail="Question is required")
        
        result = await training_service.query_model(
            db=db,
            model_id=str(model_id),
            user=current_user,
            question=question
        )
        
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return ModelQueryResponse(
            model_id=str(model_id),
            question=question,
            sql=result["sql"],
            message="Query executed successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query model: {str(e)}")

@router.get("/models/{model_id}/training-data")
async def get_model_training_data(
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Get all training data for a model"""
    try:
        training_data = await training_service.get_model_training_data(db, str(model_id))
        return training_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get training data: {str(e)}")

# Training Documentation Management
@router.post("/models/{model_id}/documentation", response_model=ModelTrainingDocumentationResponse)
async def create_training_documentation(
    doc_data: ModelTrainingDocumentationCreate,
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Create training documentation for a model"""
    try:
        doc = await training_service.create_training_documentation(
            db=db,
            model_id=str(model_id),
            doc_data=doc_data
        )
        return doc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create training documentation: {str(e)}")

@router.get("/models/{model_id}/documentation", response_model=List[ModelTrainingDocumentationResponse])
async def get_training_documentation(
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Get all training documentation for a model"""
    try:
        docs = await training_service.get_model_training_documentation(db, str(model_id))
        return docs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get training documentation: {str(e)}")

@router.put("/documentation/{doc_id}", response_model=ModelTrainingDocumentationResponse)
async def update_training_documentation(
    doc_data: ModelTrainingDocumentationUpdate,
    doc_id: UUID = Path(..., description="Training documentation ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Update training documentation"""
    try:
        doc = await training_service.update_training_documentation(
            db=db,
            doc_id=str(doc_id),
            doc_data=doc_data
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Training documentation not found")
        return doc
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update training documentation: {str(e)}")

@router.delete("/documentation/{doc_id}")
async def delete_training_documentation(
    doc_id: UUID = Path(..., description="Training documentation ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Delete training documentation"""
    try:
        success = await training_service.delete_training_documentation(db, str(doc_id))
        if not success:
            raise HTTPException(status_code=404, detail="Training documentation not found")
        return {"message": "Training documentation deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete training documentation: {str(e)}")

# Training Questions Management
@router.post("/models/{model_id}/questions", response_model=ModelTrainingQuestionResponse)
async def create_training_question(
    question_data: ModelTrainingQuestionCreate,
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Create training question for a model"""
    try:
        question = await training_service.create_training_question(
            db=db,
            model_id=str(model_id),
            question_data=question_data
        )
        return question
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create training question: {str(e)}")

@router.get("/models/{model_id}/questions", response_model=List[ModelTrainingQuestionResponse])
async def get_training_questions(
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Get all training questions for a model"""
    try:
        questions = await training_service.get_model_training_questions(db, str(model_id))
        return questions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get training questions: {str(e)}")

@router.put("/questions/{question_id}", response_model=ModelTrainingQuestionResponse)
async def update_training_question(
    question_data: ModelTrainingQuestionUpdate,
    question_id: UUID = Path(..., description="Training question ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Update training question"""
    try:
        question = await training_service.update_training_question(
            db=db,
            question_id=str(question_id),
            question_data=question_data
        )
        if not question:
            raise HTTPException(status_code=404, detail="Training question not found")
        return question
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update training question: {str(e)}")

@router.delete("/questions/{question_id}")
async def delete_training_question(
    question_id: UUID = Path(..., description="Training question ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Delete training question"""
    try:
        success = await training_service.delete_training_question(db, str(question_id))
        if not success:
            raise HTTPException(status_code=404, detail="Training question not found")
        return {"message": "Training question deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete training question: {str(e)}")

@router.post("/questions/{question_id}/validate")
async def validate_training_question(
    question_id: UUID = Path(..., description="Training question ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Validate training question by executing the SQL query"""
    try:
        result = await training_service.validate_training_question(
            db=db,
            user=current_user,
            question_id=str(question_id)
        )
        
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["error_message"])
        
        return {
            "success": True,
            "is_validated": result["is_validated"],
            "validation_notes": result["validation_notes"],
            "execution_result": result.get("execution_result"),
            "message": result["message"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to validate training question: {str(e)}")

# Training Columns Management
@router.post("/models/{model_id}/columns", response_model=ModelTrainingColumnResponse)
async def create_training_column(
    column_data: ModelTrainingColumnCreate,
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Create training column for a model"""
    try:
        column = await training_service.create_training_column(
            db=db,
            model_id=str(model_id),
            column_data=column_data
        )
        return column
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create training column: {str(e)}")

@router.get("/models/{model_id}/columns", response_model=List[ModelTrainingColumnResponse])
async def get_training_columns(
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Get all training columns for a model"""
    try:
        columns = await training_service.get_model_training_columns(db, str(model_id))
        return columns
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get training columns: {str(e)}")

@router.put("/columns/{column_id}")
async def update_training_column(
    column_data: ModelTrainingColumnUpdate,
    column_id: UUID = Path(..., description="Training column ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Update training column description"""
    try:
        # Try to update as tracked column first
        column = await training_service.update_tracked_column_description(
            db=db,
            column_id=str(column_id),
            description=column_data.description
        )
        
        if column:
            return column
        
        # Fallback to old training column method
        column = await training_service.update_training_column(
            db=db,
            column_id=str(column_id),
            column_data=column_data
        )
        
        if not column:
            raise HTTPException(status_code=404, detail="Training column not found")
        return column
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update training column: {str(e)}")

@router.delete("/columns/{column_id}")
async def delete_training_column(
    column_id: UUID = Path(..., description="Training column ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Delete training column"""
    try:
        success = await training_service.delete_training_column(db, str(column_id))
        if not success:
            raise HTTPException(status_code=404, detail="Training column not found")
        return {"message": "Training column deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete training column: {str(e)}")

# AI Generation Endpoints
@router.post("/models/{model_id}/generate-column-descriptions")
async def generate_column_descriptions(
    model_id: UUID = Path(..., description="Model ID"),
    scope: str = Query("all", description="Scope: 'column', 'table', or 'all'"),
    table_name: Optional[str] = Query(None, description="Table name (required if scope is 'table')"),
    column_name: Optional[str] = Query(None, description="Column name (required if scope is 'column')"),
    additional_instructions: Optional[str] = Query(None, description="Additional instructions for AI generation"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Generate AI descriptions for columns at different scopes"""
    try:
        if scope == "column" and not column_name:
            raise HTTPException(status_code=400, detail="Column name is required for column scope")
        if scope == "table" and not table_name:
            raise HTTPException(status_code=400, detail="Table name is required for table scope")
        
        result = await training_service.generate_column_descriptions(
            db=db,
            user=current_user,
            model_id=str(model_id),
            scope=scope,
            table_name=table_name,
            column_name=column_name,
            additional_instructions=additional_instructions
        )
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error_message)
        
        return {
            "success": True,
            "model_id": str(model_id),
            "scope": scope,
            "generated_count": result.generated_count,
            "error_message": result.error_message,
            "generated_descriptions": result.generated_descriptions
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate column descriptions: {str(e)}")

@router.post("/models/{model_id}/generate-table-descriptions")
async def generate_table_descriptions(
    model_id: UUID = Path(..., description="Model ID"),
    table_name: Optional[str] = Query(None, description="Specific table name (optional)"),
    additional_instructions: Optional[str] = Query(None, description="Additional instructions for AI generation"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Generate AI descriptions for all columns in a table or all tables"""
    try:
        result = await training_service.generate_table_descriptions(
            db=db,
            user=current_user,
            model_id=str(model_id),
            table_name=table_name,
            additional_instructions=additional_instructions
        )
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error_message)
        
        response_data = {
            "success": True,
            "model_id": str(model_id),
            "table_name": table_name,
            "generated_count": result.generated_count,
            "error_message": result.error_message,
            "generated_descriptions": result.generated_descriptions
        }
        
        logger.info(f"🔍 API Response data: {response_data}")
        logger.info(f"🔍 result.generated_descriptions type: {type(result.generated_descriptions)}")
        logger.info(f"🔍 result.generated_descriptions value: {result.generated_descriptions}")
        
        return response_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate table descriptions: {str(e)}")

@router.post("/models/{model_id}/generate-all-descriptions")
async def generate_all_descriptions(
    model_id: UUID = Path(..., description="Model ID"),
    additional_instructions: Optional[str] = Query(None, description="Additional instructions for AI generation"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Generate AI descriptions for all tracked columns across all tables"""
    try:
        result = await training_service.generate_all_descriptions(
            db=db,
            user=current_user,
            model_id=str(model_id),
            additional_instructions=additional_instructions
        )
        
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error_message)
        
        return {
            "success": True,
            "model_id": str(model_id),
            "generated_count": result.generated_count,
            "error_message": result.error_message,
            "generated_descriptions": result.generated_descriptions
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate all descriptions: {str(e)}")

@router.get("/models/{model_id}/generate-all-descriptions-sse")
async def generate_all_descriptions_sse(
    request: Request,
    model_id: UUID = Path(..., description="Model ID"),
    additional_instructions: Optional[str] = Query(None, description="Additional instructions for AI generation"),
    current_user: User = Depends(get_current_user_from_query),
    db: AsyncSession = Depends(get_async_db)
):
    """Generate AI descriptions for all tracked columns across all tables with SSE progress updates"""
    
    async def generate_descriptions_stream():
        try:
            # Send initial progress
            yield {
                "event": "progress",
                "data": json.dumps({
                    "status": "started",
                    "message": "Starting description generation...",
                    "progress": 0
                })
            }
            
            # Get tracked tables first
            tracked_tables = await training_service._get_model_tracked_tables(db, str(model_id))
            total_tables = len(tracked_tables)
            
            if total_tables == 0:
                yield {
                    "event": "progress",
                    "data": json.dumps({
                        "status": "completed",
                        "message": "No tracked tables found",
                        "progress": 100,
                        "generated_count": 0
                    })
                }
                return
            
            # Send progress update
            yield {
                "event": "progress",
                "data": json.dumps({
                    "status": "processing",
                    "message": f"Found {total_tables} tracked tables",
                    "progress": 10
                })
            }
            
            generated_count = 0
            processed_tables = 0
            all_generated_descriptions = {}
            
            # Process each table
            for table_info in tracked_tables:
                try:
                    # Send table progress
                    yield {
                        "event": "progress",
                        "data": json.dumps({
                            "status": "processing",
                            "message": f"Processing table: {table_info.table_name}",
                            "progress": 10 + (processed_tables / total_tables) * 80,
                            "current_table": table_info.table_name
                        })
                    }
                    
                    # Get tracked columns for this table
                    tracked_columns = await training_service._get_model_tracked_columns_for_table(db, str(model_id), table_info.table_name)
                    
                    if tracked_columns:
                        # Get connection for database access
                        model = await training_service._get_model_and_verify_ownership(db, str(model_id), current_user)
                        from app.services.connection_service import connection_service
                        connection = await connection_service.get_connection_by_id(db, str(model.connection_id))
                        
                        # Generate descriptions for this table
                        descriptions = await training_service._generate_tracked_column_descriptions(
                            db, connection, table_info.table_name, tracked_columns, str(model_id), additional_instructions
                        )
                        
                        # Update column descriptions
                        for col_name, description in descriptions.items():
                            await training_service._update_column_description(db, str(model_id), table_info.table_name, col_name, description)
                            generated_count += 1
                        
                        # Collect descriptions for response
                        all_generated_descriptions[table_info.table_name] = descriptions
                        
                        # Send table completion progress
                        yield {
                            "event": "progress",
                            "data": json.dumps({
                                "status": "processing",
                                "message": f"Completed table: {table_info.table_name} ({len(descriptions)} descriptions)",
                                "progress": 10 + (processed_tables / total_tables) * 80,
                                "current_table": table_info.table_name,
                                "table_generated": len(descriptions)
                            })
                        }
                    
                    processed_tables += 1
                    
                except Exception as e:
                    logger.error(f"Error processing table {table_info.table_name}: {e}")
                    yield {
                        "event": "progress",
                        "data": json.dumps({
                            "status": "processing",
                            "message": f"Error processing table {table_info.table_name}: {str(e)}",
                            "progress": 10 + (processed_tables / total_tables) * 80,
                            "current_table": table_info.table_name,
                            "error": str(e)
                        })
                    }
                    processed_tables += 1
            
            # Send completion
            yield {
                "event": "generation_completed",
                "data": json.dumps({
                    "status": "completed",
                    "message": f"Generated {generated_count} descriptions across {total_tables} tables",
                    "progress": 100,
                    "generated_count": generated_count,
                    "total_tables": total_tables,
                    "generated_descriptions": all_generated_descriptions
                })
            }
            
        except Exception as e:
            logger.error(f"Error in description generation stream: {e}")
            yield {
                "event": "generation_error",
                "data": json.dumps({
                    "status": "error",
                    "message": f"Failed to generate descriptions: {str(e)}",
                    "error": str(e)
                })
            }
    
    return EventSourceResponse(
        generate_descriptions_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
            "X-Accel-Buffering": "no"
        }
    )

# Enhanced Training Generation Endpoint
@router.post("/models/{model_id}/generate-questions", response_model=QuestionGenerationResponse)
async def generate_enhanced_questions(
    scope_config: QuestionGenerationRequest,
    model_id: UUID = Path(..., description="Model ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db)
):
    """Generate enhanced training questions with specific scope and column associations"""
    try:
        # Debug: Log what's received from frontend
        logger.info(f"=== API RECEIVED SCOPE CONFIG ===")
        logger.info(f"Additional Instructions: '{scope_config.additional_instructions}'")
        logger.info(f"Type: {scope_config.type}")
        logger.info(f"Tables: {scope_config.tables}")
        logger.info(f"Columns: {scope_config.columns}")
        logger.info(f"Num Questions: {scope_config.num_questions}")
        logger.info(f"=== END API DEBUG ===")
        
        result = await training_service.generate_enhanced_training_questions(
            db=db,
            user=current_user,
            model_id=str(model_id),
            scope_config=scope_config.dict(),
            task_id=str(model_id)  # For now, using model_id as task_id
        )
        
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result.get("error_message", "Generation failed"))
        
        return QuestionGenerationResponse(
            success=True,
            generated_count=result["generated_count"],
            scope=result["scope"],
            message=result["message"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate enhanced questions: {str(e)}")