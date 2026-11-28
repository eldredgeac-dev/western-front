// boxes.js — facts about the map: finding boxes, checking the map data, names,
// and trench maximums. Pure functions only: no page, no randomness.

// Make a lookup table { id: box } so we can find a box quickly by its id.
export function indexBoxes(map) {
  const byId = {};
  for (const box of map.boxes) byId[box.id] = box;
  return byId;
}

// Check that the map data makes sense. Returns a list of problems in plain
// English; an empty list means the map is fine.
// `terrainData` is data/terrain.json (used to check terrain ids exist).
export function checkMap(map, terrainData) {
  const problems = [];
  const byId = {};
  const laneIds = new Set(map.lanes.map((l) => l.id));
  const columnIds = new Set(map.columns.map((c) => c.id));
  const terrainIds = new Set(terrainData.types.map((t) => t.id));

  // 1. Every id is unique.
  for (const box of map.boxes) {
    if (byId[box.id]) problems.push(`duplicate box id ${box.id}`);
    byId[box.id] = box;
  }

  for (const box of map.boxes) {
    // 2. Lane, column and terrain must be ones the data defines.
    if (!laneIds.has(box.lane)) problems.push(`${box.id}: unknown lane ${box.lane}`);
    if (!columnIds.has(box.column)) problems.push(`${box.id}: unknown column ${box.column}`);
    for (const t of box.terrain) {
      if (!terrainIds.has(t)) problems.push(`${box.id}: unknown terrain ${t}`);
    }
    // 3. Every neighbour exists, isn't the box itself, and lists this box back.
    for (const nId of box.neighbours) {
      const other = byId[nId];
      if (!other) problems.push(`${box.id}: neighbour ${nId} does not exist`);
      else if (nId === box.id) problems.push(`${box.id}: is its own neighbour`);
      else if (!other.neighbours.includes(box.id)) {
        problems.push(`${box.id} → ${nId} is one-way (${nId} does not list ${box.id})`);
      }
    }
  }
  return problems;
}

// The name to show for a box: its own name if it has one (a city), or else the town
// it's named after on the map (its anchor town). Players see place names, never the grid
// labels ("lane 3", "E1"), which are only for the rules and the code.
export function boxName(map, box) {
  if (box.name) return box.name;
  return box.anchor ? box.anchor.town : box.id;
}

// The deepest trench a box may have in a given month ("YYYY-MM"), from
// RULES.md §9.5 (the numbers live in data/terrain.json).
export function trenchMax(box, terrainData, month) {
  const periods = terrainData.trenchMax.periods;
  // Find the latest period that has started by this month.
  // "YYYY-MM" strings sort correctly as text, so we can compare them directly.
  let period = periods[0];
  for (const p of periods) {
    if (p.from <= month) period = p;
  }
  // Terrain can override the normal limit. If several do, the lowest wins.
  let limit = null;
  for (const t of box.terrain) {
    const special = period.byTerrain[t];
    if (special !== undefined) limit = limit === null ? special : Math.min(limit, special);
  }
  return limit === null ? period.normal : limit;
}
