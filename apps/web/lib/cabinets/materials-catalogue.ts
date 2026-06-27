import { buildDb } from "@/lib/db";

export interface Material {
  id: string;
  name: string;
  species: string | null;
  door_style: string | null;
  hardware_line: string | null;
  category: "wood" | "door_style" | "hardware";
  finish_image_url: string | null;
  description: string | null;
  carb_compliant: boolean;
  prop65_warning: boolean;
  configurator_slug: string;
  created_at: string;
}

const SELECT_COLUMNS = `
  id, name, species, door_style, hardware_line, category,
  finish_image_url, description, carb_compliant, prop65_warning,
  configurator_slug, created_at
`;

/**
 * Returns all active materials ordered by category (wood → door_style → hardware)
 * then alphabetically by name. Reads from the cabinet_materials table.
 */
export async function getMaterials(): Promise<Material[]> {
  const db = buildDb();
  return db.query<Material>(
    `SELECT ${SELECT_COLUMNS}
     FROM cabinet_materials
     WHERE active = true
     ORDER BY
       CASE category
         WHEN 'wood'       THEN 1
         WHEN 'door_style' THEN 2
         WHEN 'hardware'   THEN 3
         ELSE 4
       END,
       name ASC`
  );
}

/**
 * Returns a single active material by UUID, or null if not found.
 */
export async function getMaterialById(id: string): Promise<Material | null> {
  const db = buildDb();
  const rows = await db.query<Material>(
    `SELECT ${SELECT_COLUMNS}
     FROM cabinet_materials
     WHERE id = $1 AND active = true`,
    id
  );
  return rows[0] ?? null;
}

/**
 * Returns active materials filtered by category.
 */
export async function getMaterialsByCategory(
  category: Material["category"]
): Promise<Material[]> {
  const db = buildDb();
  return db.query<Material>(
    `SELECT ${SELECT_COLUMNS}
     FROM cabinet_materials
     WHERE active = true AND category = $1
     ORDER BY name ASC`,
    category
  );
}
