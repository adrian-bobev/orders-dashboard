FROM node:20-slim

# Install Python and dependencies for PDF generation
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ghostscript \
    imagemagick \
    poppler-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Update ImageMagick policy to allow PDF operations
RUN sed -i 's/<policy domain="coder" rights="none" pattern="PDF" \/>/<policy domain="coder" rights="read|write" pattern="PDF" \/>/g' /etc/ImageMagick-6/policy.xml

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
COPY server.js index.js pdf-bleed.py pdf-to-images.py pdf-to-images-wrapper.js PSOcoated_v3.icc ./
COPY fonts ./fonts
COPY public ./public

# Create directories for uploads
RUN mkdir -p uploads

# Expose port
EXPOSE 4001

# Start the server
CMD ["node", "server.js"]
