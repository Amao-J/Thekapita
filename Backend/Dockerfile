
ARG PYTHON_VERSION=3.12-slim-bookworm
FROM python:${PYTHON_VERSION}
# Create a virtual environment
RUN python -m venv /opt/venv

# Set the virtual environment as the current location
ENV PATH=/opt/venv/bin:$PATH

# Upgrade pip
RUN pip install --upgrade pip

# Set Python-related environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install os dependencies for our mini vm
RUN apt-get update && apt-get install -y \
    libpq-dev \
    libjpeg-dev \
    libcairo2 \
    ffmpeg \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Create the mini vm's code directory
RUN mkdir -p /code

# Set the working directory to that same code directory
WORKDIR /code

# Copy the requirements file into the container
COPY requirements.txt /tmp/requirements.txt

# copy the project code into the container's working directory
COPY ./src /code

# Install the Python project requirements
RUN pip install --upgrade pip
RUN pip install -r /tmp/requirements.txt
RUN pip install uvicorn[standard]

# collectstatic needs *a* secret key to import settings, but the real one is
# supplied at runtime by Railway variables and is never baked into the image.
RUN DJANGO_SECRET_KEY=DJANGO_SECRET_KEY = E0FTEphNXcIF-3yP88pTk5v67JzFAl4zxE58PkU9AmF-3Nvhow5b1RFWDZOy-2J8-_XEdREUriZdOpAMMONgdg python manage.py collectstatic --noinput

ARG PROJ_NAME="app"


RUN printf "#!/bin/bash\n" > ./paracord_runner.sh && \
    printf "RUN_PORT=\"\${PORT:-8000}\"\n\n" >> ./paracord_runner.sh && \
    printf "python manage.py migrate --no-input\n" >> ./paracord_runner.sh && \
    printf "uvicorn ${PROJ_NAME}.asgi:application --host 0.0.0.0 --port \$RUN_PORT\n" >> ./paracord_runner.sh

# make the bash script executable
RUN chmod +x paracord_runner.sh

# Clean up apt cache to reduce image size


# Run the Django project via the runtime script
# when the container starts
CMD ./paracord_runner.sh
