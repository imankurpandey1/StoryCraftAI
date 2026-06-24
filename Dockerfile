FROM python:3.10-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install gunicorn

# Copy the rest of the codebase
COPY . .

# Create the user and set permissions for Hugging Face Spaces (requires UID 1000)
RUN useradd -m -u 1000 user
RUN chown -R user:user /app
USER user

# Set environment variables so the app binds to port 7860 (required by HF Spaces)
ENV STORYCRAFT_HOST=0.0.0.0
ENV STORYCRAFT_PORT=7860
ENV PORT=7860

# Command to run the application using gunicorn
CMD ["gunicorn", "-b", "0.0.0.0:7860", "-w", "1", "--threads", "2", "--timeout", "120", "app:app"]
