# Hardened runtime image for the platform probe.
#
# Changes from a naive Python image:
#   * a numeric, unprivileged UID/GID with no login shell
#   * no compiler toolchain in the final layer
#   * bytecode writing and buffering disabled
#   * the process is started as non-root, not dropped at runtime
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN groupadd --gid 65532 app \
    && useradd --uid 65532 --gid 65532 --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY app.py /app/app.py

USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["python3", "/app/app.py"]
