FROM node:20-slim

# Install Python and dependencies for PDF generation
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ghostscript \
    imagemagick \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create Python virtual environment
RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy package files and install Node dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy application files
COPY server.js pdf-bleed.py pdf-to-images.py pdf-to-images-wrapper.js ./
COPY fonts ./fonts

# Create directories for uploads and output
RUN mkdir -p uploads generated_cmyk_tiffs preview-images

# Expose port
EXPOSE 4001

# Start the server
CMD ["node", "server.js"]
