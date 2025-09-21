# Use the official Deno image as the base image
FROM denoland/deno:2.0.0

# Set the working directory inside the container
WORKDIR /app

# Copy the Deno configuration file
COPY deno.json .

# Copy the source code files
COPY denoWorker.js .
COPY syncMatchData.js .

# Create a non-root user for security
RUN addgroup --system --gid 1001 deno && \
    adduser --system --uid 1001 --gid 1001 deno

# Change ownership of the app directory to the deno user
RUN chown -R deno:deno /app

# Switch to the non-root user
USER deno

# Expose the port (if needed for health checks)
EXPOSE 8000

# Set environment variables
ENV DENO_DIR=/app/.deno
ENV DENO_UNSTABLE=1

# Create the .deno directory
RUN mkdir -p /app/.deno

# Cache dependencies (this will download and cache the dependencies)
RUN deno cache --unstable-cron denoWorker.js

# Set the default command to run the Deno worker
CMD ["deno", "run", "--allow-net", "--allow-env", "--unstable-cron", "denoWorker.js"]
