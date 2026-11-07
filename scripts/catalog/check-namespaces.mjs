import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });
const allNamespaces = db.prepare("SELECT provider, namespace, count(entity_id) as count FROM catalog_external_identities GROUP BY provider, namespace").all();
console.log('All namespaces in external identities:', allNamespaces);
