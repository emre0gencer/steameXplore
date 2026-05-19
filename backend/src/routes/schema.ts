import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { steamFetch } from '../services/steamApi';
import { withCache, TTL } from '../services/cache';

const router = Router();

// Games with IEconItems schema support
const SCHEMA_SUPPORTED: Record<string, string> = {
  '440': 'TF2',
  '730': 'CS2',
  '570': 'Dota 2',
  '252490': 'Rust',
};

// TF2 (440): full schema — items, attributes, qualities, effects, etc.
async function getTF2Schema() {
  return steamFetch<{
    result: {
      status: number;
      items_game_url: string;
      qualities: Record<string, number>;
      qualityNames: Record<string, string>;
      originNames: { origin: number; name: string }[];
      items: {
        name: string;
        defindex: number;
        item_class: string;
        item_type_name: string;
        item_name: string;
        proper_name: boolean;
        item_slot: string;
        item_quality: number;
        image_inventory: string;
        min_ilevel: number;
        max_ilevel: number;
        image_url: string;
        image_url_large: string;
        craft_class: string;
        craft_material_type: string;
        capabilities: Record<string, boolean>;
        used_by_classes: string[];
        attributes: { name: string; class: string; value: number }[];
      }[];
      attributes: {
        name: string;
        defindex: number;
        attribute_class: string;
        description_string: string;
        description_format: string;
        effect_type: string;
        hidden: boolean;
        stored_as_integer: boolean;
      }[];
      item_sets: {
        item_set: string;
        name: string;
        items: string[];
        attributes: { name: string; class: string; value: number }[];
      }[];
      kill_eater_score_types: { type: number; type_name: string; level_data: string }[];
      string_lookups: { table_name: string; strings: { index: number; string: string }[] }[];
    };
  }>('/IEconItems/440/GetSchema/v2', { language: 'english' });
}

// CS2 / Dota 2 / others: schema URL — points to a hosted VDF/JSON file
async function getSchemaUrl(appid: string) {
  return steamFetch<{
    result: {
      status: number;
      items_game_url: string;
    };
  }>(`/IEconItems/${appid}/GetSchemaURL/v1`, {});
}

router.get('/:appid', requireAuth, async (req, res) => {
  const { appid } = req.params;

  if (!SCHEMA_SUPPORTED[appid]) {
    return res.status(400).json({
      error: `Schema not supported for appid ${appid}`,
      supported: SCHEMA_SUPPORTED,
    });
  }

  try {
    // Schema is keyed by appid only — not per-user, same data for everyone
    const data = await withCache(
      `schema:${appid}`,
      TTL.LONG,
      () => appid === '440' ? getTF2Schema().then((d) => d.result) : getSchemaUrl(appid).then((d) => d.result)
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
