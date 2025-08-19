# PDF Intelligence Engine - Adobe India Hackathon 2025
FROM python:3.11-slim

# Install system dependencies including Node.js
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy and install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./

# Copy frontend code
COPY frontend_app/ ./frontend/

# Install frontend dependencies and build
WORKDIR /app/frontend
RUN npm install && npm run build

# Go back to app directory
WORKDIR /app

# Create uploads directory
RUN mkdir -p uploads

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV DOCKER_ENV=1

# Frontend environment variables
ENV NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_ADOBE_CLIENT_ID=""

# Backend environment variables  
ENV MONGODB_URI=mongodb://localhost:27017
ENV DB_NAME=mydb
ENV HOST=127.0.0.1
ENV PORT=8080
ENV UPLOAD_DIR=/app/uploads
ENV SECRET_KEY=your-secret-key-here
ENV GOOGLE_API_KEY=""
ENV CHROMA_DB_PATH=/app/chromadb
ENV COLLECTION_NAME=document_chunks
ENV LLM_PROVIDER=gemini
ENV GEMINI_MODEL=gemini-2.5-flash

# Expose port 8080 as required by hackathon
EXPOSE 8080

# Create entrypoint script for unified service
RUN echo '#!/bin/bash\n\
    echo "🚀 Starting PDF Intelligence Engine (Unified Service)..."\n\
    \n\
    # Start backend server on port 8080 (serves both API and frontend)\n\
    echo "📚 Starting unified backend+frontend service on port 8080..."\n\
    python main.py\n' > /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/docs || exit 1

# Command to run the application
CMD ["/app/entrypoint.sh"]
