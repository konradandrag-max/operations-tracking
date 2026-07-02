# Item Master CSV Import Format

## Overview

Item master records (part numbers, descriptions, and standard times) are imported from an external system via CSV. The import script upserts records, so it can be run repeatedly as the source data changes.

## CSV Format

The file must be a plain UTF-8 CSV with a header row as the first line.

### Required Columns (order does not matter)

| Column | Type | Description | Example |
|---|---|---|---|
| `item_master_no` | string | Unique key from the source system. Uppercased on import. | `IM-00123` |
| `part_number` | string | Human-readable part number | `PN-456` |
| `description` | string | Part description | `Impeller Housing Cover` |
| `standard_setup_time_sec` | integer | Standard setup time in **seconds** | `180` (= 3 minutes) |
| `standard_cycle_time_sec` | integer | Standard cycle time per piece in **seconds** | `45` |

### Example File

```csv
item_master_no,part_number,description,standard_setup_time_sec,standard_cycle_time_sec
IM-00123,PN-456,Impeller Housing Cover,180,45
IM-00124,PN-457,Pump Shaft 150mm,300,90
IM-00125,PN-458,Bearing Housing Type A,240,60
```

## Running the Import

```bash
# From the repo root:
npx tsx scripts/import-item-master.ts path/to/your-export.csv
```

Or if running inside the server workspace:

```bash
cd server
npx tsx ../scripts/import-item-master.ts ../data/items.csv
```

## Notes

- Rows with missing or non-numeric required fields are skipped with a warning.
- `last_imported_at` is set to the import run time for every upserted row.
- Times are in **seconds** — convert from minutes/hours before importing (e.g. 3 min → 180).
- The `item_master_no` is the single join key used throughout the tracking system. It must match exactly what operators scan on the shop floor.
- This format is a placeholder until the real ERP export format is confirmed. The import script is straightforward to adapt to a different column set or delimiter.

## Security / Access Note

Machine-number-only identification means any operator at a given tablet is trusted as that machine's operator. There is no separate operator login or PIN. This is a documented design decision, not an oversight — the shop floor context (physical access control) is the authentication layer.
