# Use a slim Python 3.11 image, which is based on Debian Bookworm (12)
FROM python:3.11-slim
WORKDIR /app

# Install initial system dependencies required for both drivers and general operation.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        gnupg2 \
        apt-transport-https \
        ca-certificates \
        unixodbc \
        unixodbc-dev \
        wget && \
    rm -rf /var/lib/apt/lists/*

# Install ODBC drivers based on architecture
ARG TARGETARCH
ARG TARGETPLATFORM

# Install Microsoft ODBC drivers for both architectures
RUN if [ "$TARGETARCH" = "amd64" ]; then \
        echo "Installing Microsoft ODBC drivers for x86_64..." && \
        echo "deb [arch=amd64,trusted=yes] https://packages.microsoft.com/debian/10/prod buster main" > /etc/apt/sources.list.d/mssql-release-17.list && \
        echo "deb [arch=amd64,trusted=yes] https://packages.microsoft.com/debian/11/prod bullseye main" > /etc/apt/sources.list.d/mssql-release-18.list && \
        curl https://packages.microsoft.com/keys/microsoft.asc | tee /etc/apt/trusted.gpg.d/microsoft.asc && \
        apt-get update && \
        ACCEPT_EULA=Y apt-get install -y msodbcsql17 msodbcsql18 && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/* && \
        rm -f /etc/apt/sources.list.d/mssql-release-17.list \
               /etc/apt/sources.list.d/mssql-release-18.list \
               /etc/apt/trusted.gpg.d/microsoft.asc; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
        echo "Installing Microsoft ODBC drivers for ARM64..." && \
        echo "deb [arch=arm64,trusted=yes] https://packages.microsoft.com/debian/11/prod bullseye main" > /etc/apt/sources.list.d/mssql-release-18.list && \
        curl https://packages.microsoft.com/keys/microsoft.asc | tee /etc/apt/trusted.gpg.d/microsoft.asc && \
        apt-get update && \
        ACCEPT_EULA=Y apt-get install -y msodbcsql18 && \
        apt-get clean && \
        rm -rf /var/lib/apt/lists/* && \
        rm -f /etc/apt/sources.list.d/mssql-release-18.list \
               /etc/apt/trusted.gpg.d/microsoft.asc; \
    else \
        echo "Unsupported architecture: $TARGETARCH" && \
        exit 1; \
    fi

# Copy Python requirements file and install dependencies
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create a non-root user for the application
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Create necessary directories for your application and user home
RUN mkdir -p /app/data /app/uploads /app/chroma_db /app/onnx_models /home/appuser /home/appuser/.cache && \
    chown -R appuser:appuser /app /home/appuser && \
    chmod -R 755 /home/appuser && \
    chmod -R 777 /home/appuser/.cache

# Copy application code into the image
COPY . .

# Ensure proper ownership of all files
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose the port your application will listen on
EXPOSE 6020

# Command to run your application when the container starts
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "6020"]
