export function createMySQLDuplicateKeyUpdate(columns) {
    const prefix = ' on duplicate key update ';
    const updates = columns.map(col => `\`${col}\` = values(\`${col}\`)`)
            .join(', ');

    return prefix + updates;
}
