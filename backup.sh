#!/bin/bash
BACKUP_DIR="/opt/veridion-nexus/backups"
DATE=$(date +%Y-%m-%d_%H-%M)
mkdir -p "$BACKUP_DIR"
docker exec veridion-nexus-postgres-1 pg_dump -U postgres veridion_api | gzip > "$BACKUP_DIR/backup_$DATE.sql.gz"
# Keep only last 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
echo "Backup completed: backup_$DATE.sql.gz"
