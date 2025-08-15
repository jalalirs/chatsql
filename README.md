# ChatSQL - AI-Powered Text-to-SQL Generation System

A modern web application that converts natural language questions into SQL queries using AI. Built with FastAPI, React, and Vanna AI framework.

## 🚀 Features

- **Natural Language to SQL**: Convert questions in plain English to executable SQL queries
- **Multi-Database Support**: Works with PostgreSQL, MSSQL, and other databases
- **AI Model Training**: Train custom models with your specific database schema and examples
- **Real-time Conversations**: Chat interface for interactive SQL generation
- **Schema Management**: Track tables and columns for focused training
- **Training Data Management**: Add documentation, questions, and SQL examples
- **User Authentication**: Secure user management with JWT tokens
- **Modern UI**: Clean, responsive interface built with React and Tailwind CSS

## 🏗️ Architecture

### Backend (FastAPI)
- **Framework**: FastAPI with async SQLAlchemy
- **AI Engine**: Vanna AI with OpenAI/Groq integration
- **Database**: PostgreSQL for application data
- **Authentication**: JWT-based user authentication
- **Real-time**: Server-Sent Events (SSE) for live updates

### Frontend (React)
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React hooks and context
- **Real-time**: EventSource for live updates

### Database Support
- **Application Database**: PostgreSQL
- **Target Databases**: PostgreSQL, MSSQL, and more
- **Vector Store**: ChromaDB for AI training data

## 🛠️ Quick Start

### Prerequisites
- Docker and Docker Compose
- OpenAI API key or Groq API key

### 1. Clone the Repository
```bash
git clone <repository-url>
cd chatsql
```

### 2. Environment Setup
Create a `.env` file in the root directory:
```env
# AI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.groq.com/openai/v1  # For Groq
OPENAI_MODEL=meta-llama/llama-4-maverick-17b-128e-instruct

# Security
SECRET_KEY=your_secret_key_here

# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/chatsql
```

### 3. Start the Application
```bash
# Development mode with hot reloading
docker compose -f docker-compose.dev.yml up -d

# Production mode
docker compose up -d
```

### 4. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:6020
- **PostgreSQL**: localhost:5432
- **MSSQL**: localhost:1433

## 📖 Usage Guide

### 1. Create an Account
- Register a new account at http://localhost:3000/register
- Log in with your credentials

### 2. Add a Database Connection
- Go to "Connections" tab
- Click "Add Connection"
- Enter your database details (PostgreSQL, MSSQL, etc.)
- Test the connection

### 3. Create a Model
- Go to "Models" tab
- Click "Create Model"
- Select your database connection
- Choose tables and columns to track

### 4. Train Your Model
- Add training documentation (database schema, business rules)
- Generate or add question-SQL pairs
- Train the model with your data

### 5. Generate SQL
- Use the "Query" tab to ask questions in natural language
- Or use the chat interface for conversations
- Review and execute generated SQL

## 🔧 Development

### Project Structure
```
chatsql/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/            # API endpoints
│   │   ├── core/           # Core functionality
│   │   ├── models/         # Database models and schemas
│   │   ├── services/       # Business logic
│   │   └── prompts/        # AI prompt templates
│   ├── alembic/            # Database migrations
│   └── requirements.txt    # Python dependencies
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/       # API services
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Utility functions
│   └── package.json        # Node.js dependencies
└── docker-compose.dev.yml  # Development environment
```

### Development Commands
```bash
# Start development environment
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml logs -f frontend-dev

# Restart services
docker compose -f docker-compose.dev.yml restart backend
docker compose -f docker-compose.dev.yml restart frontend-dev

# Stop all services
docker compose -f docker-compose.dev.yml down
```

### Database Migrations
```bash
# Run migrations
docker compose -f docker-compose.dev.yml exec backend alembic upgrade head

# Create new migration
docker compose -f docker-compose.dev.yml exec backend alembic revision --autogenerate -m "description"
```

## 🔌 API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh JWT token

### Models
- `GET /models` - List models
- `POST /models` - Create model
- `GET /models/{id}` - Get model details
- `PUT /models/{id}` - Update model
- `DELETE /models/{id}` - Delete model

### Training
- `POST /training/models/{id}/train` - Train model
- `POST /training/models/{id}/generate-questions` - Generate training questions
- `POST /training/models/{id}/generate-sql` - Generate SQL from questions

### Query
- `POST /models/{id}/query` - Query model
- `POST /conversations` - Create conversation
- `POST /conversations/{id}/query` - Send message to conversation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the documentation in the `/docs` folder
- Review the TODO file for known issues and planned features

## 🔄 Recent Updates

- Fixed tracked columns count to show only columns with `is_tracked=true`
- Improved model overview UI with better organization
- Added support for Groq API as an alternative to OpenAI
- Enhanced training data management with better validation
- Streamlined conversation interface for better user experience 