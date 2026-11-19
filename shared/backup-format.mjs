export const LOCAL_BACKUP_FORMAT='atencion-local-v1';
// Version 1 has the same schema across earlier product names.
export const isLocalBackupFormat=value=>typeof value==='string'&&/^[a-z][a-z0-9-]*-local-v1$/.test(value);
